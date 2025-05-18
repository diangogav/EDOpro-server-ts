# Changelog

## [2.7.0](https://github.com/diangogav/EDOpro-server-ts/compare/v2.6.0...v2.7.0) (2025-05-18)


### Features

* add ranked flag to distinguish ranked/unranked duels ([76c86ef](https://github.com/diangogav/EDOpro-server-ts/commit/76c86ef7ca1c7b28d0b7ed845867d761dcf17ab7))
* added otto and toot ([aa2f685](https://github.com/diangogav/EDOpro-server-ts/commit/aa2f6852c65d49f4d576c2730e86985121a6fce6))
* added otto and toot ([6e31940](https://github.com/diangogav/EDOpro-server-ts/commit/6e31940c6c132ce1fc48f662da294f956bf566d4))
* **room:** add players ready validation before starting duel ([af1522d](https://github.com/diangogav/EDOpro-server-ts/commit/af1522db6cbe494490df312409bf7c6a25aee8e4))
* update server messages to English ([#167](https://github.com/diangogav/EDOpro-server-ts/issues/167)) ([467a474](https://github.com/diangogav/EDOpro-server-ts/commit/467a474e2368e7598fd9a74b0275a28b7059484c))


### Bug Fixes

* **docker:** required packages ([#164](https://github.com/diangogav/EDOpro-server-ts/issues/164)) ([a40fe11](https://github.com/diangogav/EDOpro-server-ts/commit/a40fe11d1a635bd2a67779dbad08b497bcf0ac49))
* fix basic stats calculator test ([#166](https://github.com/diangogav/EDOpro-server-ts/issues/166)) ([a9ffb23](https://github.com/diangogav/EDOpro-server-ts/commit/a9ffb2356d845a15f704b77b6fb06937dd3af18f))

## [2.6.0](https://github.com/diangogav/EDOpro-server-ts/compare/v2.5.0...v2.6.0) (2025-04-23)


### Features

* add support for Rush Ritual monsters ([bf2d69b](https://github.com/diangogav/EDOpro-server-ts/commit/bf2d69b2ecfca8365e557d49d33070b77d8f097d))
* logs for web socket ([44d66d4](https://github.com/diangogav/EDOpro-server-ts/commit/44d66d42eaa59b268324bec3352665c6fb82946f))
* **mercury:** :sparkles: Identifie ranked mrcury rooms ([2eb0f1e](https://github.com/diangogav/EDOpro-server-ts/commit/2eb0f1eb09813b88b61b8804be7e3beb13c66933))
* **mercury:** :zap: added ocg command ([#154](https://github.com/diangogav/EDOpro-server-ts/issues/154)) ([112c854](https://github.com/diangogav/EDOpro-server-ts/commit/112c854233feb58295edaf6eb827f1974451a692))
* **room:** improve player position handling in waiting state ([9fa926f](https://github.com/diangogav/EDOpro-server-ts/commit/9fa926ff7df0e9836297933585ec42482a938b71))


### Bug Fixes

* **duel:** fix reconnection logic for tag duels ([1f830e5](https://github.com/diangogav/EDOpro-server-ts/commit/1f830e54b717d3b49bf2949cff53779d016a449c))
* md command ([8ae654d](https://github.com/diangogav/EDOpro-server-ts/commit/8ae654d4817d4b1ace48356026aaf162166460c1))
* **mercury:** :bug: fix goat lflist index ([0e49a07](https://github.com/diangogav/EDOpro-server-ts/commit/0e49a078335ed9b210328e3611721775a4e9aa65))
* **mercury:** :bug: the join message is intercepted to make the ban list compatible with edo pro ([d6679df](https://github.com/diangogav/EDOpro-server-ts/commit/d6679df2d7f7429ffd46c7af09414455bdbc26ba))
* **mercury:** prevent duplicate game state updates by processing messages only from first player ([9ef85a9](https://github.com/diangogav/EDOpro-server-ts/commit/9ef85a98c41b9ea2e1abfb18c7eb17e04a30cd9c))
* show ban list hash in client based on mercury ([9ce0436](https://github.com/diangogav/EDOpro-server-ts/commit/9ce04360482e866c29cd546eaee3fedb38fceb43))

## [2.5.0](https://github.com/diangogav/EDOpro-server-ts/compare/v2.4.0...v2.5.0) (2025-04-02)


### Features

* season 4 ([1efff33](https://github.com/diangogav/EDOpro-server-ts/commit/1efff336b45c5cd329bcfc54af19da4a17acdd15))
* update mercury bin ([31f3f67](https://github.com/diangogav/EDOpro-server-ts/commit/31f3f67acc1738a84f8c7023adb1d7e9593abb44))


### Bug Fixes

* rank validator ([4d98554](https://github.com/diangogav/EDOpro-server-ts/commit/4d985547427c38f54d222620ba676fdbb4d03b6b))
* season 4 in matches and duels ([3bc2824](https://github.com/diangogav/EDOpro-server-ts/commit/3bc2824725de704b9f82c2e726f78b10d52dd55d))
* season in player stats ([3bd898d](https://github.com/diangogav/EDOpro-server-ts/commit/3bd898ddf0c788e82038ae49cabea0c34948d058))

## [2.4.0](https://github.com/diangogav/EDOpro-server-ts/compare/v2.3.0...v2.4.0) (2024-11-15)


### Features

* added season property to player stats ([416fc32](https://github.com/diangogav/EDOpro-server-ts/commit/416fc32a41e141344450fed7f1136ca7894bf58b))


### Bug Fixes

* :bug: Validate max card count in deck validation ([34d520e](https://github.com/diangogav/EDOpro-server-ts/commit/34d520ee656837c7ab03f0d41ba3d7b6e73121ea))
* :hammer: Fix name in global stats script ([#142](https://github.com/diangogav/EDOpro-server-ts/issues/142)) ([46b571b](https://github.com/diangogav/EDOpro-server-ts/commit/46b571bd1e9e4009c07471bedad285c5d7d92e4b))
* comment reconnect validation ([59575a0](https://github.com/diangogav/EDOpro-server-ts/commit/59575a03a154d5d1e0fa9c02f321188d156557ea))
* spectator cache buffer after timeout duel finish ([836a5b3](https://github.com/diangogav/EDOpro-server-ts/commit/836a5b3a1c4b36964fb432318eeac558f011e85d))
* validate socket state in player reconnection ([e60b55b](https://github.com/diangogav/EDOpro-server-ts/commit/e60b55bac071e219c16b545f137347c47b48a92a))

## [2.3.0](https://github.com/diangogav/EDOpro-server-ts/compare/v2.2.1...v2.3.0) (2024-10-26)


### Features

* :sparkles: Custom commands for mercury rooms ([#131](https://github.com/diangogav/EDOpro-server-ts/issues/131)) ([2ad3534](https://github.com/diangogav/EDOpro-server-ts/commit/2ad3534b6d3630234eaebb3e17889ea26db18b5f))


### Bug Fixes

* :adhesive_bandage: Spectators entering from the lobby watched the duel with errors ([62d9853](https://github.com/diangogav/EDOpro-server-ts/commit/62d9853a994a7a7baec3cfe7e5d7fd461889b833))
* :bug: Fix alternatives commands ([d094240](https://github.com/diangogav/EDOpro-server-ts/commit/d09424078127736f5c6580a995d10c0bb9582b87))

## [2.2.1](https://github.com/diangogav/EDOpro-server-ts/compare/v2.2.0...v2.2.1) (2024-08-30)


### Bug Fixes

* :bug: Mercury rooms were not returned to show them in real time on the web ([#129](https://github.com/diangogav/EDOpro-server-ts/issues/129)) ([1aeac54](https://github.com/diangogav/EDOpro-server-ts/commit/1aeac5495d221e365804b1677cafdf395163fbcf))
* :bug: Visual errors corrected when reconnecting in edopro rooms ([#128](https://github.com/diangogav/EDOpro-server-ts/issues/128)) ([07f0d3e](https://github.com/diangogav/EDOpro-server-ts/commit/07f0d3e3c9fb2669a5c737d150e146ab5982cc6d))

## [2.2.0](https://github.com/diangogav/EDOpro-server-ts/compare/v2.1.5...v2.2.0) (2024-08-30)


### Features

* :sparkles: Mercury rooms are now integrated with the websockets tracking system ([086a107](https://github.com/diangogav/EDOpro-server-ts/commit/086a1078288d08a143ea2132e05702780c6f053b))

## [2.1.5](https://github.com/diangogav/EDOpro-server-ts/compare/v2.1.4...v2.1.5) (2024-08-28)


### Bug Fixes

* :bug: Fix duel status for mercury duels in edopro lobby ([688fb22](https://github.com/diangogav/EDOpro-server-ts/commit/688fb22b6453fc30e19db1dc3f98d9392c4ccb6f))

## [2.1.4](https://github.com/diangogav/EDOpro-server-ts/compare/v2.1.3...v2.1.4) (2024-08-20)


### Bug Fixes

* :ambulance: Fix score in draw duel ([5ea62b4](https://github.com/diangogav/EDOpro-server-ts/commit/5ea62b466ed062fb10ac71382f9152a8a7d34f4a))

## [2.1.3](https://github.com/diangogav/EDOpro-server-ts/compare/v2.1.2...v2.1.3) (2024-08-18)


### Bug Fixes

* :bug: Relay player order ([a11dc89](https://github.com/diangogav/EDOpro-server-ts/commit/a11dc897dc01e5c9a84c78557cd3b62a490b8f5c))

## [2.2.0](https://github.com/diegofcornejo/EDOpro-server-ts/compare/v2.1.2...v2.2.0) (2024-08-05)


### Features

* :sparkles: Added ranking points for mercury duels ([75c979f](https://github.com/diegofcornejo/EDOpro-server-ts/commit/75c979f01f0845435b571c4f06f2dde8e54597ef))
* Add buildspec file for  CI/CD on AWS Codepipeline ([e395c93](https://github.com/diegofcornejo/EDOpro-server-ts/commit/e395c93b1942e71c8e7672fb47491cf2b4f86612))
* Add consistent notes for HTTP CreateRoom method. ([f0e560d](https://github.com/diegofcornejo/EDOpro-server-ts/commit/f0e560d45fcdc44ad91ea58ee2897b150a8dbebf))
* Add GET method to sync database endpoint ([e231ecb](https://github.com/diegofcornejo/EDOpro-server-ts/commit/e231ecb80bd565103c96f65031025997ce2f181c))
* banlist validation ([00d1ffa](https://github.com/diegofcornejo/EDOpro-server-ts/commit/00d1ffa291a065ffb4b4b03ecac7fe5559adcaef))
* create unranked room if redis is not enabled ([866d9e8](https://github.com/diegofcornejo/EDOpro-server-ts/commit/866d9e8e4ebd3f8486781cbfeeda0bdd089a6ebc))
* implement SendMessageToAllRooms controller ([0eb0643](https://github.com/diegofcornejo/EDOpro-server-ts/commit/0eb0643beb76cead234423fbc3f945970d0d7ff2))
* make Redis optional for server initialization ([7037aaa](https://github.com/diegofcornejo/EDOpro-server-ts/commit/7037aaa3eb5d34b34ce4c7a8c51e11e7c3fead37))
* rollback banlist validation ([68fe03a](https://github.com/diegofcornejo/EDOpro-server-ts/commit/68fe03a71a6897e40194ecc0c5cd15c2fdc06bf0))
* send message to all rooms and clients ([587bc8e](https://github.com/diegofcornejo/EDOpro-server-ts/commit/587bc8e9891bd06eb6f3250d938957df7f334459))
* Update RoomCreator to include tournament name in notes if it is provided in the payload. ([ffdb122](https://github.com/diegofcornejo/EDOpro-server-ts/commit/ffdb1221caa5ca89dbd0985298cedf9d82b37a2a))


### Bug Fixes

* :adhesive_bandage: Fix mercury duel state transaction ([f084cda](https://github.com/diegofcornejo/EDOpro-server-ts/commit/f084cda99726484b97dbee29b4f8410592baeb48))
* :ambulance: Auth for mercury players ([#112](https://github.com/diegofcornejo/EDOpro-server-ts/issues/112)) ([d094a4f](https://github.com/diegofcornejo/EDOpro-server-ts/commit/d094a4f0016840ad7380c0d6446cfc66ba3388d2))
* :ambulance: Mercury rank points persistence, score command and messages ([c60fd9c](https://github.com/diegofcornejo/EDOpro-server-ts/commit/c60fd9c1f94a7daafd510ce87ae10e13874e3a69))
* :bug: Chat messages fixed ([fe956cb](https://github.com/diegofcornejo/EDOpro-server-ts/commit/fe956cb44d4cb4ef66fbef5544ef9a9932635326))
* convert utf8 password to utf16 at RoomCreator ([8d96b99](https://github.com/diegofcornejo/EDOpro-server-ts/commit/8d96b998dd8cd661acd1cf3cc32cbdaf347f52f6))
* default tcg banlist for mercury ([ff0f6c6](https://github.com/diegofcornejo/EDOpro-server-ts/commit/ff0f6c6a6d51cf4e794b1d791d3bd7a8fb98fcba))
* Dockerfile build server stage ([0c3b528](https://github.com/diegofcornejo/EDOpro-server-ts/commit/0c3b5285b8e407026e4eae71aa8d97e3fe548ecf))
* Dockerfile build server stage ([ec535c5](https://github.com/diegofcornejo/EDOpro-server-ts/commit/ec535c53869c5795e5407f2d93b34b9f46239b38))
* duplicated chat messages at mercury caused by extends to RoomState at MercuryJoinHandler ([7fbfc78](https://github.com/diegofcornejo/EDOpro-server-ts/commit/7fbfc782858a8233ebb94cfd151116704751116a))
* Grave flag ([090007a](https://github.com/diegofcornejo/EDOpro-server-ts/commit/090007ab1cf4ebd07c09253a0bb027a1e09532bb))
* **linter:** refactor redis optional to comply with linter rules ([4cfb84c](https://github.com/diegofcornejo/EDOpro-server-ts/commit/4cfb84cdbee10729e3a167cc2b03de79511dfeee))
* mercury lflist links ([721721e](https://github.com/diegofcornejo/EDOpro-server-ts/commit/721721e1b98063319462e526d476d40a8809a375))
* mercury lflist links ([825141a](https://github.com/diegofcornejo/EDOpro-server-ts/commit/825141aea1475687eb59520151f698418ca654f5))
* player to spectator validation now is with socket id and not with player name ([1e62f23](https://github.com/diegofcornejo/EDOpro-server-ts/commit/1e62f239e9e0f4c6bda5a8bc2f8c6d236d5389cc))
* player winner message when player surrenders ([db0d471](https://github.com/diegofcornejo/EDOpro-server-ts/commit/db0d471d7526142aa47fa1ba4266915fc475f475))
* racing code for handleUpdatedDeck and handleReady ([64e9667](https://github.com/diegofcornejo/EDOpro-server-ts/commit/64e9667b675a6a0608de30d3167f73d9b2418421))
* remove dangling rooms when creation crash from client ([9b97063](https://github.com/diegofcornejo/EDOpro-server-ts/commit/9b97063c9f24c8a398f57b08247ef59d1730bddd))
* spectators message working in mercury ([6acfcbd](https://github.com/diegofcornejo/EDOpro-server-ts/commit/6acfcbde778f1123bdaf7b444e8fe5e104309b38))
* update Dockerfile to include curl and git dependencies ([45cf18a](https://github.com/diegofcornejo/EDOpro-server-ts/commit/45cf18a60f76c1636f9e031d531bf2afbfb8910d))
* update vulnerable dependencies to secure versions ([e84361c](https://github.com/diegofcornejo/EDOpro-server-ts/commit/e84361c8b214fc05f5ebe7bfd8838a341a3dc082))
* winner reasons messages ([179716f](https://github.com/diegofcornejo/EDOpro-server-ts/commit/179716f1b557d8766da9015a03e965877a5c566d))

## [2.1.2](https://github.com/diangogav/EDOpro-server-ts/compare/v2.1.1...v2.1.2) (2024-08-05)


### Bug Fixes

* :ambulance: Mercury rank points persistence, score command and messages ([c60fd9c](https://github.com/diangogav/EDOpro-server-ts/commit/c60fd9c1f94a7daafd510ce87ae10e13874e3a69))

## [2.1.1](https://github.com/diangogav/EDOpro-server-ts/compare/v2.1.0...v2.1.1) (2024-08-04)


### Bug Fixes

* :ambulance: Auth for mercury players ([#112](https://github.com/diangogav/EDOpro-server-ts/issues/112)) ([d094a4f](https://github.com/diangogav/EDOpro-server-ts/commit/d094a4f0016840ad7380c0d6446cfc66ba3388d2))

## [2.1.0](https://github.com/diangogav/EDOpro-server-ts/compare/v2.0.0...v2.1.0) (2024-08-04)


### Features

* :sparkles: Added ranking points for mercury duels ([75c979f](https://github.com/diangogav/EDOpro-server-ts/commit/75c979f01f0845435b571c4f06f2dde8e54597ef))
* Add consistent notes for HTTP CreateRoom method. ([f0e560d](https://github.com/diangogav/EDOpro-server-ts/commit/f0e560d45fcdc44ad91ea58ee2897b150a8dbebf))
* banlist validation ([00d1ffa](https://github.com/diangogav/EDOpro-server-ts/commit/00d1ffa291a065ffb4b4b03ecac7fe5559adcaef))
* create unranked room if redis is not enabled ([866d9e8](https://github.com/diangogav/EDOpro-server-ts/commit/866d9e8e4ebd3f8486781cbfeeda0bdd089a6ebc))
* implement SendMessageToAllRooms controller ([0eb0643](https://github.com/diangogav/EDOpro-server-ts/commit/0eb0643beb76cead234423fbc3f945970d0d7ff2))
* make Redis optional for server initialization ([7037aaa](https://github.com/diangogav/EDOpro-server-ts/commit/7037aaa3eb5d34b34ce4c7a8c51e11e7c3fead37))
* rollback banlist validation ([68fe03a](https://github.com/diangogav/EDOpro-server-ts/commit/68fe03a71a6897e40194ecc0c5cd15c2fdc06bf0))
* send message to all rooms and clients ([587bc8e](https://github.com/diangogav/EDOpro-server-ts/commit/587bc8e9891bd06eb6f3250d938957df7f334459))
* Update RoomCreator to include tournament name in notes if it is provided in the payload. ([ffdb122](https://github.com/diangogav/EDOpro-server-ts/commit/ffdb1221caa5ca89dbd0985298cedf9d82b37a2a))


### Bug Fixes

* :adhesive_bandage: Fix mercury duel state transaction ([f084cda](https://github.com/diangogav/EDOpro-server-ts/commit/f084cda99726484b97dbee29b4f8410592baeb48))
* :bug: Chat messages fixed ([fe956cb](https://github.com/diangogav/EDOpro-server-ts/commit/fe956cb44d4cb4ef66fbef5544ef9a9932635326))
* convert utf8 password to utf16 at RoomCreator ([8d96b99](https://github.com/diangogav/EDOpro-server-ts/commit/8d96b998dd8cd661acd1cf3cc32cbdaf347f52f6))
* default tcg banlist for mercury ([ff0f6c6](https://github.com/diangogav/EDOpro-server-ts/commit/ff0f6c6a6d51cf4e794b1d791d3bd7a8fb98fcba))
* duplicated chat messages at mercury caused by extends to RoomState at MercuryJoinHandler ([7fbfc78](https://github.com/diangogav/EDOpro-server-ts/commit/7fbfc782858a8233ebb94cfd151116704751116a))
* **linter:** refactor redis optional to comply with linter rules ([4cfb84c](https://github.com/diangogav/EDOpro-server-ts/commit/4cfb84cdbee10729e3a167cc2b03de79511dfeee))
* mercury lflist links ([721721e](https://github.com/diangogav/EDOpro-server-ts/commit/721721e1b98063319462e526d476d40a8809a375))
* mercury lflist links ([825141a](https://github.com/diangogav/EDOpro-server-ts/commit/825141aea1475687eb59520151f698418ca654f5))
* player to spectator validation now is with socket id and not with player name ([1e62f23](https://github.com/diangogav/EDOpro-server-ts/commit/1e62f239e9e0f4c6bda5a8bc2f8c6d236d5389cc))
* player winner message when player surrenders ([db0d471](https://github.com/diangogav/EDOpro-server-ts/commit/db0d471d7526142aa47fa1ba4266915fc475f475))
* remove dangling rooms when creation crash from client ([9b97063](https://github.com/diangogav/EDOpro-server-ts/commit/9b97063c9f24c8a398f57b08247ef59d1730bddd))
* spectators message working in mercury ([6acfcbd](https://github.com/diangogav/EDOpro-server-ts/commit/6acfcbde778f1123bdaf7b444e8fe5e104309b38))
* update Dockerfile to include curl and git dependencies ([45cf18a](https://github.com/diangogav/EDOpro-server-ts/commit/45cf18a60f76c1636f9e031d531bf2afbfb8910d))
* update vulnerable dependencies to secure versions ([e84361c](https://github.com/diangogav/EDOpro-server-ts/commit/e84361c8b214fc05f5ebe7bfd8838a341a3dc082))
* winner reasons messages ([179716f](https://github.com/diangogav/EDOpro-server-ts/commit/179716f1b557d8766da9015a03e965877a5c566d))
