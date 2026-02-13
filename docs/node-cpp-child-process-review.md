# Revisión de arquitectura Node.js ↔ C++ (child_process)

## Resumen ejecutivo

El diseño actual funciona, pero tiene cuellos de botella y riesgos de robustez en el canal IPC:

1. Se mezclan **dos protocolos distintos** (entrada con JSON por línea y salida con JSON prefijado por longitud).
2. Hay manejo incompleto de **backpressure** en `stdin` desde Node.js.
3. El parser de salida en Node.js procesa **solo un mensaje por evento**, lo que puede dejar mensajes acumulados.
4. En C++ se emiten logs por `stdout` fuera del framing, lo que puede corromper el stream.
5. Se envía la configuración inicial por `argv[1]`, con riesgo de límite de tamaño y sin validación de `argc`.

---

## Hallazgos técnicos

### 1) Protocolo de entrada/salida asimétrico

- Node inicia el core con un JSON grande en los argumentos de proceso (`argv[1]`).
- Luego envía comandos por `stdin` como JSON terminado en `\n`.
- C++ responde por `stdout` con framing binario: `uint32_le + json`.

Esto obliga a mantener parsers distintos en ambos sentidos y complica diagnóstico, retries y evolución de versión de protocolo.

### 2) Backpressure: retries con `setTimeout` en vez de cola + `drain`

`writeToCppProcess` reintenta en 100ms si `stdin.write()` devuelve `false`, pero no espera evento `drain` ni serializa una cola explícita. En picos puede causar:

- Reintentos redundantes.
- Latencia artificial.
- Riesgo de duplicación/reordenamiento si cambian timings.

### 3) Consumo parcial de mensajes del core

En `DuelingState`, al recibir `stdout` se llama `processMessage()` una sola vez por chunk, y `processMessage()` no drena en bucle mientras haya mensajes listos. Si un chunk trae múltiples frames, se procesa el primero y los demás dependen de un evento futuro.

### 4) Posible corrupción del canal de salida del core

El core envía mensajes de protocolo por `stdout` con framing binario (`send_message`), pero también hay código que escribe logs a `stdout` (`Timer expired...`). Cualquier byte no enmarcado rompe el parser Node.

### 5) Inicialización frágil por argumentos de proceso

`main.cpp` usa `argv[1]` sin validar `argc`. Además, serializar toda la configuración y decks en la línea de comandos aumenta riesgo por límites del sistema operativo y dificulta observabilidad segura.

### 6) Mercury: bootstrap de puerto con `stdout.once("data")`

En Mercury se toma el puerto del primer chunk de `stdout` (`once("data")`). Si llegan bytes parciales/extra en el primer chunk, el parseo se vuelve frágil.

---

## Plan de mejora recomendado (priorizado)

## Fase 1 (alto impacto, bajo riesgo)

1. **Unificar logs fuera del canal IPC**
   - Regla: protocolo exclusivamente por `stdout`; logs exclusivamente por `stderr`.
   - Mover cualquier `std::cout` de diagnóstico a `std::cerr` en C++.

2. **Drenar completamente frames en Node**
   - Cambiar `processMessage()` para iterar `while (isMessageReady())`.
   - Mantener límite de seguridad por tick para evitar starvation (ej. 1k mensajes).

3. **Backpressure correcto**
   - Implementar cola FIFO de comandos a C++.
   - Escribir hasta que `write()` devuelva `false`, pausar y continuar en `duel.stdin.once("drain")`.

## Fase 2 (robustez de protocolo)

4. **Handshake/versionado de protocolo**
   - Mensaje inicial `HELLO { protocolVersion, features }` en ambos sentidos.
   - Rechazar versiones incompatibles explícitamente.

5. **Unificar framing en ambas direcciones**
   - Opción recomendada: `length-prefixed JSON` para `stdin` y `stdout`.
   - Evitar parser por saltos de línea para comandos entrantes.

6. **Mover bootstrap de configuración a `stdin`**
   - En vez de `argv[1]`, enviar `INIT` por el mismo canal framed.
   - Añadir validaciones de esquema y respuesta de `ACK_INIT`.

## Fase 3 (performance y operación)

7. **Codificación binaria para mensajes calientes**
   - Mantener JSON para control-plane.
   - Usar MessagePack/CBOR (o binario propio) para data-plane de alta frecuencia.

8. **Pool de workers C++ por matchmaker**
   - Evaluar proceso por duelo vs. worker pool según throughput objetivo.

9. **Observabilidad de IPC**
   - Métricas: cola IPC, `drain wait`, frames/s, parse errors, tamaño de frame p95/p99.

---

## ¿Se puede cambiar JSON por otro protocolo más rápido?

Sí. Para este caso (Node + C++ con mensajes frecuentes), las opciones más prácticas son:

### 1) MessagePack (recomendado)

- **Ventajas**: payload más pequeño que JSON, parseo más rápido, esquema flexible, librerías maduras en Node y C++.
- **Costo de migración**: medio.
- **Uso sugerido**: reemplazo directo para mensajes actuales (`START`, `TIME`, `CORE`, etc.) con framing por longitud.

### 2) FlatBuffers / Cap’n Proto

- **Ventajas**: muy alto rendimiento, acceso casi zero-copy.
- **Costo de migración**: alto (IDL, generación de código, versionado estricto).
- **Uso sugerido**: si el cuello de botella IPC ya está probado en profiling y se requiere latencia ultra baja.

### 3) Protobuf

- **Ventajas**: ecosistema excelente, buen versionado, rendimiento sólido.
- **Costo de migración**: medio/alto por definición de `.proto` y mapeo de tipos.
- **Uso sugerido**: si se prioriza interoperabilidad y contratos muy estables.

### Decisión práctica sugerida

1. Corto plazo: **JSON length-prefixed bidireccional** (homogeneizar primero).
2. Mediano plazo: migrar a **MessagePack length-prefixed** para data/control plane.
3. Largo plazo: evaluar **FlatBuffers/Cap’n Proto** solo con métricas que justifiquen la complejidad.

---

## ¿Hay un canal de comunicación mejor que `child_process` stdio?

Sí, dependiendo del objetivo.

### Opción A) Unix Domain Socket (UDS) / Named Pipe (recomendado si siguen procesos separados)

- **Pros**: canal dedicado, menor overhead que TCP local, fácil multiplexar, control más fino de reconexión/healthcheck.
- **Contras**: más complejidad operativa que stdio.
- **Cuándo usar**: cuando necesitan robustez, observabilidad y posibilidad de reinicio independiente del core.

### Opción B) TCP loopback (127.0.0.1)

- **Pros**: simple, portable, útil si ya hay arquitectura tipo Mercury con puertos.
- **Contras**: overhead mayor que UDS.

### Opción C) Node-API addon (in-process)

- **Pros**: máxima performance (sin serialización IPC entre procesos).
- **Contras**: riesgo de tumbar todo el proceso Node ante fallo nativo; despliegue y debugging más complejos.
- **Cuándo usar**: solo si priorizan latencia extrema y aceptan costo operacional alto.

### Opción D) gRPC local

- **Pros**: contratos claros, observabilidad, tooling.
- **Contras**: overhead y complejidad mayor para este tipo de motor de duelo de alta frecuencia.

### Recomendación de canal

1. Mantener procesos separados (aislamiento de fallos).
2. Migrar de stdio a **UDS + framing binario (MessagePack)**.
3. Reservar addon in-process para una fase posterior, solo si benchmarks reales lo exigen.

---

## Riesgos actuales visibles

- Deadlocks/lags intermitentes bajo carga por backpressure incompleto.
- Corrupción de stream por logs en `stdout` del proceso C++.
- Mensajes pendientes en buffer Node sin drenar de inmediato.
- Falla de arranque por `argv[1]` ausente o demasiado grande.

---

## Quick wins concretos (1–2 días)

1. Mover logs C++ de `stdout` a `stderr` y auditar todo uso de `std::cout` fuera de `send_message`.
2. Refactor de `DuelingState.processMessage()` para drenar en bucle.
3. Reemplazar retries temporizados por cola+`drain` en `Room.writeToCppProcess`.
4. Validar `argc` en `main.cpp` y emitir error estructurado por `stderr`.

---

## Referencias de código revisadas

- `src/edopro/room/domain/states/dueling/DuelingState.ts`
- `src/edopro/room/domain/Room.ts`
- `src/edopro/messages/JSONMessageProcessor.ts`
- `src/mercury/room/domain/MercuryRoom.ts`
- `core/src/main.cpp`
- `core/src/app/duel.cpp`
- `core/src/modules/shared/DuelTurnTimer.cpp`
