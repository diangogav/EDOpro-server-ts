# Changelog

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
