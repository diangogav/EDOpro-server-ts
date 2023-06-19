# Proyecto EDO Pro Server

## Requisitos de instalación 📋

- Conan (2.0.6): [conan](https://conan.io/)
- Node.js (18.16.0): Asegúrate de tener Node.js instalado en tu sistema. Puedes descargar la última versión estable desde [https://nodejs.org](https://nodejs.org). 📥🚀

## Guía de instalación de Conan 🚀

1. Instala `Python` y `pip`

```bash
apt install python3 python3-pip -y
```

2. Instala conan a través de `pip`

```bash
pip install conan
```

3. Configura el perfil de `conan`

```bash
conan profile detect
```

## Guía de compilación para C++

1. Clona este repositorio en tu máquina local utilizando el siguiente comando:

```bash
git clone https://github.com/tuusuario/edo-pro-server.git
```

2. Ubicate en la carpeta core, la cual contiene todo el código C++ del proyecto.

3. Descarga `premake` y copialo en la ruta del paso 2 (Este paso solo hay que realizarlo 1 vez)

```bash
wget https://github.com/premake/premake-core/releases/download/v5.0.0-beta2/premake-5.0.0-beta2-linux.tar.gz
```

```
 tar -zxvf premake-5.0.0-beta2-linux.tar.gz
```

4.  Instala las dependencias a través de `Conan`

```bash
conan install . --build missing --output-folder=./dependencies
```

5.  Genera el archivo `make` usando `premake5` descargado en el paso 3

```bash
./premake5 gmake
```

6.  Genera el binario:

```bash
make
```

## Iniciar el servidor

1. Ubícate en la raíz del proyecto.

2. Instala las dependencias a través de `npm`:

```bash
npm install
```

3. Inicia el proyecto:

```bash
npm start
```
