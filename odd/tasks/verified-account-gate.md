# Verified account gate

Objective: only verified accounts play ranked/tournaments and write in room chat; guests and unverified accounts keep playing casual without chat.
Branch: `feat/verified-account-gate` (EDOpro-server-ts; API and clients get their own branches). Delivery: ask-on-risk. Test runner: `pnpm test` (server), `bun test` (API).

## Specs

- S1. Email verification is required regardless of the email domain. User: "yo iria primero con verificacion de correo sin distincion de dominio, a ver como va la cosa".
- S2. It applies to accounts registered from the web ranking and from EvoDuel. User: "eso debe aplicar tanto para registros del wev ranking como para registros desde evoduel". Both register through the evolution-api `UserRegister` use case.
- S3. An account counts as verified when it has `email_verified_at`, OR a linked Discord (`discord_id`), OR it was created before a cutoff date. No existing data is modified. User: "me gusta lo de la fecha de corte". The cutoff is configuration (env var), set to the deploy date.
- S4. Ranked and tournament play require a verified account (S3).
- S5. Casual play stays open to everyone, including guests without an account. User: "si no estas verificado no puedes jugar ranked pero si jugar casual? seguiria siendo un probema? xq igual en el server puedes jugar casual sin cuenta".
- S6. Guests and unverified accounts cannot write anything in room chat, on any client and in any room state, including as spectators. User: "diria que no puedan escribir nada". The sender gets a short private notice explaining they must verify their email; nobody else sees the message.
- S7. Bots (WindBot / internal AI seats) are exempt from S4 and S6.
- S8. Before enforcing, verification emails must be confirmed to arrive (Gmail, Outlook, nauta.cu), because only a small share of new accounts verify today.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S8 | manual (user registers test accounts) | in progress | Gmail OK: test account created 14:16:59, verified 14:17:30 (2026-11-24). Outlook, nauta.cu pending |
| T2 | S3 | inline, server: load `emailVerifiedAt`, `discordId`, `createdAt` into `UserProfile`; pure `isVerifiedAccount(profile, cutoff)` rule; cutoff env var | done | RED: VerifiedAccount module missing (compile error stopped the run; config/repository REDs not observed separately). GREEN: user-profile + config 18 pass; full suite 3317 pass; biome + tsc clean on touched files. `.env.example` not updated (agent cannot access .env* files): add `VERIFIED_ACCOUNT_CUTOFF` there by hand |
| T3 | S6, S7 | inline, server: resolve the account for EDOPro casual players and mid-duel spectators so verified players are not treated as guests | pending | |
| T4 | S6, S7 | inline, server: chat gate in `RoomState.handleChat` behind an enable flag, private notice via `createSystemChat`, bot exemption | pending | |
| T5 | S4, S7 | inline, server: ranked/tournament admission requires a verified account | pending | |
| T6 | S2, S3 | API: expose the effective verified status to clients (check `EmailVerificationStatus`) | pending | |
| T7 | S2, S6 | clients (evolution-card-game, web ranking): banner with resend button when unverified | pending | |

## Log

- L1 (2026-11-24, user, verbatim): "yo iria primero con verificacion de correo sin distincion de dominio, a ver como va la cosa / eso debe aplicar tanto para registros del wev ranking como para registros desde evoduel"
- L2 (2026-11-24): MDPro team (Dizzy, Senator John) prefer email verification over Discord-only; Discord stays as an alternative.
- L3 (2026-11-24, user, verbatim): "vamos por paso, primero marcare todos los correos actuales como verificados" → replaced by a cutoff date after review: marking would have verified disposable and invalid addresses and erased the real verification signal. User: "me gusta lo de la fecha de corte".
- L4 (2026-11-24, user, verbatim): "si no estas verificado no puedes jugar ranked pero si jugar casual? seguiria siendo un probema? xq igual en el server puedes jugar casual sin cuenta" → casual gating is about chat, not play.
- L5 (2026-11-24, user, verbatim): "diria que no puedan escribir nada".
- L6 (2026-11-24): code map. All chat goes through `RoomState.handleChat` (src/shared/room/domain/RoomState.ts:145); YGOPro guests are allowed in casual (`CredentialResolver`, `RoomAdmission`); EDOPro casual players and mid-duel spectators carry no userId; `UserProfile` drops `emailVerifiedAt`; WindBot resolves as guest and is identified by `isInternal`/`internalForRoomId`.
- L7 (2026-11-24): Gmail delivery confirmed: welcome email arrived and the link verified the account within a minute. The welcome copy says verification is only for account recovery; T7 must update it once the gate is on (verification will be needed for ranked and chat).
- L8 (2026-11-24): T2 done. `VERIFIED_ACCOUNT_CUTOFF` (ISO 8601) in `config.verifiedAccount.cutoff`; unset or invalid means no age exemption. `UserProfile.isVerified(cutoff)` delegates to `isVerifiedAccount`. No behavior change until T4/T5 use it.
- Next: T1 Outlook and nauta.cu (user); T3.
