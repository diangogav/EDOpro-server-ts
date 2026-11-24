---
name: "Verified account gate: remaining work"
description: "Show players whether their account counts as verified, then require a verified account for ranked play and for lightning tournament entry."
created_at: "2026-11-24T18:20:00Z"

created_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

implemented_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

last_implementation_at: "2026-11-24T19:11:04Z"
has_completed_all_phases: "false"
---

# Verified account gate: remaining work

## 🎯 Goal

Let players see whether their account counts as verified and how to fix it, then require a verified account to play ranked and to enter lightning tournaments. An account is verified when it confirmed its email, linked Discord, or was created before the cutoff date.

## 👀 Context

Work already done on branch `feat/verified-account-gate` of this repository (history in [`odd/tasks/verified-account-gate.md`](../../../odd/tasks/verified-account-gate.md), tasks T1 to T4):

- The verification rule: [`src/shared/user-profile/domain/VerifiedAccount.ts`](../../../src/shared/user-profile/domain/VerifiedAccount.ts), `UserProfile.isVerified(cutoff)`, `config.verifiedAccount.cutoff` from `VERIFIED_ACCOUNT_CUTOFF` in [`src/config/index.ts`](../../../src/config/index.ts).
- Every admitted client carries `accountVerification: Promise<boolean>`: [`src/shared/client/domain/YgoClient.ts`](../../../src/shared/client/domain/YgoClient.ts), resolved by [`src/shared/user-profile/application/VerifyAccount.ts`](../../../src/shared/user-profile/application/VerifyAccount.ts) through the [`AccountVerifier`](../../../src/shared/user-profile/domain/AccountVerifier.ts) port.
- Room chat gate behind `VERIFIED_CHAT_REQUIRED` (default off): `RoomState.handleChat` in [`src/shared/room/domain/RoomState.ts`](../../../src/shared/room/domain/RoomState.ts).

Duel server (this repository):

- Ranked admission: [`src/shared/room/admission/domain/RoomAdmission.ts`](../../../src/shared/room/admission/domain/RoomAdmission.ts) (rejects guests with `ranked-requires-account`), [`Admission.ts`](../../../src/shared/room/admission/domain/Admission.ts), [`src/ygopro/room/admission/application/CredentialResolver.ts`](../../../src/ygopro/room/admission/application/CredentialResolver.ts), [`AdmitToRoom.ts`](../../../src/ygopro/room/admission/application/AdmitToRoom.ts).
- EDOPro ranked joins: [`src/edopro/room/domain/states/waiting/WaitingState.ts`](../../../src/edopro/room/domain/states/waiting/WaitingState.ts), [`src/edopro/room/application/JoinHandler.ts`](../../../src/edopro/room/application/JoinHandler.ts), [`GameCreatorHandler.ts`](../../../src/edopro/room/application/GameCreatorHandler.ts), [`AuthenticatePlayer.ts`](../../../src/edopro/room/application/AuthenticatePlayer.ts).
- Ranked matchmaking: [`src/ygopro/matchmaking/application/EnterMatchmaking.ts`](../../../src/ygopro/matchmaking/application/EnterMatchmaking.ts), [`AuthenticateMatchmakingSession.ts`](../../../src/ygopro/matchmaking/application/AuthenticateMatchmakingSession.ts).
- Docs to follow: [`CLAUDE.md`](../../../CLAUDE.md), [`docs/multi-client.md`](../../../docs/multi-client.md), [`docs/testing.md`](../../../docs/testing.md), [`src/edopro/AGENTS.md`](../../../src/edopro/AGENTS.md), [`src/ygopro/AGENTS.md`](../../../src/ygopro/AGENTS.md).

API (`evolution-api`):

- Verification status and resend: [`src/modules/user/application/EmailVerificationStatus.ts`](../../../../evolution-api/src/modules/user/application/EmailVerificationStatus.ts), routes `GET /users/email-verification` and `POST /users/email-verification/resend` in [`src/server/routes/user-router.ts`](../../../../evolution-api/src/server/routes/user-router.ts).
- Welcome email: [`src/modules/user/application/UserRegister.ts`](../../../../evolution-api/src/modules/user/application/UserRegister.ts).
- Lightning tournament entry: [`src/modules/lightning/application/EnterLightningTournament.ts`](../../../../evolution-api/src/modules/lightning/application/EnterLightningTournament.ts).
- Docs to follow: [`AGENTS.md`](../../../../evolution-api/AGENTS.md), [`.agent/skills/evolution-api-modules/SKILL.md`](../../../../evolution-api/.agent/skills/evolution-api-modules/SKILL.md), [`docs/architecture.md`](../../../../evolution-api/docs/architecture.md).

Clients:

- EvoDuel (`evolution-card-game`): [`src/features/profile/ui/EmailVerificationNotice.svelte`](../../../../evolution-card-game/src/features/profile/ui/EmailVerificationNotice.svelte), [`src/features/profile/ui/Profile.svelte`](../../../../evolution-card-game/src/features/profile/ui/Profile.svelte), [`src/features/auth/application/AuthService.ts`](../../../../evolution-card-game/src/features/auth/application/AuthService.ts), [`src/features/auth/infrastructure/HttpAuthApi.ts`](../../../../evolution-card-game/src/features/auth/infrastructure/HttpAuthApi.ts). Docs: [`AGENTS.md`](../../../../evolution-card-game/AGENTS.md) and the `svelte-5` skill in `.claude/skills/`.
- Web ranking (`evolutionygo-web-ranking`): [`src/components/Settings/SettingsForm.tsx`](../../../../evolutionygo-web-ranking/src/components/Settings/SettingsForm.tsx). Docs: [`AGENTS.md`](../../../../evolutionygo-web-ranking/AGENTS.md).

Decisions already taken:

- No existing data is modified: accounts created before `VERIFIED_ACCOUNT_CUTOFF` count as verified.
- Every gate ships behind its own switch, off by default: `VERIFIED_CHAT_REQUIRED` (server, done), `VERIFIED_RANKED_REQUIRED` (server), `VERIFIED_TOURNAMENTS_REQUIRED` (API). Switch them on only after Phase 1 ships in both clients.
- The verification rule is duplicated in the duel server and the API, since they share no code outside `evolution-types`.

## 🪜 Phases

### Phase 1: Players see whether their account counts as verified

The API reports whether the account counts as verified, the welcome and resend emails explain why confirming matters, and both clients show a notice with a resend button while the account is not verified.

Public contracts:

- Application services (API):
  - `isVerifiedAccount(facts: { emailVerifiedAt: Date | null; discordId: string | null; createdAt: Date | null }, cutoff: Date | null): boolean`: pure domain rule, same semantics as the duel server.
  - `EmailVerificationStatus.get(userId: string): Promise<{ verified: boolean; accountVerified: boolean }>`.
  - Config `verifiedAccount.cutoff` from `VERIFIED_ACCOUNT_CUTOFF` (ISO 8601; unset or invalid means no account is exempt by age).
- HTTP contract (API): `GET /api/v1/users/email-verification` responds `{ verified: boolean, accountVerified: boolean }`.
- Text copies:
  - Welcome email and resend email: "Confirm your email with the button below. You need a confirmed email or a linked Discord account to chat in rooms, play ranked and join tournaments. The link works for 24 hours."
  - Client notice (EvoDuel and web ranking): "Confirm your email to chat in rooms, play ranked and join tournaments." with a "Resend email" button.
- Test suites:
  - API `isVerifiedAccount`: accepts a confirmed email; accepts a linked Discord; accepts an account created before the cutoff; rejects an account created at or after the cutoff without email or Discord; exempts nobody by age without a cutoff; rejects an unknown creation date.
  - API `EmailVerificationStatus`: reports `accountVerified` true for a confirmed email, for a linked Discord and for an account older than the cutoff; reports false for a new unconfirmed account; `verified` keeps its current meaning.
  - API config: cutoff unset, valid ISO date, invalid value.
  - API OpenAPI ratchet: the response schema includes `accountVerified`.
  - API `UserRegister` / resend: the email body contains the new copy.
  - EvoDuel `EmailVerificationNotice`: shown when `accountVerified` is false, hidden when true, the button calls resend and shows the throttle message on 429; shown in the lobby and in the profile.
  - Web ranking settings notice: shown when `accountVerified` is false, hidden when true, the button calls resend.

To-do actions:

- [x] API: add `isVerifiedAccount` and the `VERIFIED_ACCOUNT_CUTOFF` config, test-first.
- [x] API: return `accountVerified` from `EmailVerificationStatus.get` and the route schema, test-first.
- [x] API: update the welcome and resend email copy, test-first.
- [x] EvoDuel: read `accountVerified`, show `EmailVerificationNotice` with the new copy in the lobby and in the profile, test-first. The lobby notice lives in `ConnectScreen.svelte`, the screen before joining rooms.
- [x] Web ranking: show the notice with resend in Settings, test-first.
- [x] Document `VERIFIED_ACCOUNT_CUTOFF` for the API (config comment; `.env.example` by hand). The config comment is done; adding it to `.env.example` is pending on the user.
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 2: Ranked requires a verified account

With `VERIFIED_RANKED_REQUIRED` on, the duel server refuses ranked rooms and the ranked matchmaking queue to accounts that are not verified, in both flows, and tells the player why. Casual play is unchanged.

Public contracts:

- Domain (duel server):
  - `AdmissionRejection` gains `"ranked-requires-verified-account"`.
  - `RoomAdmission.decide` rejects a non-guest credential whose account is not verified in a ranked league when the switch is on.
  - Config `verifiedAccount.rankedRequired` from `VERIFIED_RANKED_REQUIRED` (true only for "true" or "1").
- Application services (duel server): EDOPro ranked join and room creation, and `EnterMatchmaking` for the ranked queue, refuse an unverified account when the switch is on.
- Text copy: "Verify your email to play ranked: log in at evolutionygo.com and confirm it from your profile."
- Test suites:
  - `RoomAdmission`: verified account admitted to ranked; unverified account rejected with `ranked-requires-verified-account`; switch off admits as today; casual league unaffected; guest still gets `ranked-requires-account`.
  - YGOPro admission (`AdmitToRoom`): the rejection reaches the client with the copy above.
  - EDOPro `WaitingState` / `GameCreatorHandler`: unverified account refused from a ranked room with the copy; verified admitted; switch off unchanged; casual unchanged.
  - `EnterMatchmaking`: unverified account refused from the ranked queue with the copy; verified enters; switch off unchanged.
  - Config: `VERIFIED_RANKED_REQUIRED` parsing ("true", "1", "TRUE", unset, other values).

To-do actions:

- [x] Add the `VERIFIED_RANKED_REQUIRED` config, test-first.
- [x] YGOPro ranked rooms: carry the account verification into the admission decision and reject unverified accounts, test-first.
- [x] EDOPro ranked rooms: refuse unverified accounts on join and on room creation, test-first.
- [x] Ranked matchmaking: refuse unverified accounts when entering the queue, test-first. Covers the socket queue (rejected STATUS, wire reason `unverified_account` = 18) and the HTTP queue (403 with the copy). Known gaps: spectators joining a ranked duel already running are not checked in either flow (the guest rule has the same gap), reconnects are not gated on purpose, and clients must map reason 18 to the copy.
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 3: Tournament entry requires a verified account

With `VERIFIED_TOURNAMENTS_REQUIRED` on, the API refuses lightning tournament entry to accounts that are not verified, and EvoDuel shows the reason.

Public contracts:

- Application services (API): `EnterLightningTournament.run` throws `ForbiddenError("Verify your email to join tournaments")` for an unverified account when the switch is on.
- Config (API): `verifiedAccount.tournamentsRequired` from `VERIFIED_TOURNAMENTS_REQUIRED` (true only for "true" or "1").
- Text copy: "Verify your email to join tournaments".
- Test suites:
  - API `EnterLightningTournament`: verified account enters; unverified account refused with `ForbiddenError` and nothing is stored; switch off unchanged.
  - API config: `VERIFIED_TOURNAMENTS_REQUIRED` parsing.
  - EvoDuel tournament entry: the 403 message is shown to the player.

To-do actions:

- [ ] API: add the `VERIFIED_TOURNAMENTS_REQUIRED` config and the entry check, test-first.
- [ ] EvoDuel: show the refusal message on tournament entry, test-first.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

## ⏭️ Next step

Implement Phase 3 so lightning tournament entry requires a verified account behind `VERIFIED_TOURNAMENTS_REQUIRED`.

The sign is up and the ranked door has a bouncer: 📬 🛡️ 🐢 💨 (Turbotuga™, [Codely](https://codely.com)'s mascot).
