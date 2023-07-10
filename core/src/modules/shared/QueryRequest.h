#ifndef QUERY_REQUEST
#define QUERY_REQUEST

#include <variant>
#include <iostream>
#include <cstdint>

#define QUERY_CODE         0x1
#define QUERY_POSITION     0x2
#define QUERY_ALIAS        0x4
#define QUERY_TYPE         0x8
#define QUERY_LEVEL        0x10
#define QUERY_RANK         0x20
#define QUERY_ATTRIBUTE    0x40
#define QUERY_RACE         0x80
#define QUERY_ATTACK       0x100
#define QUERY_DEFENSE      0x200
#define QUERY_BASE_ATTACK  0x400
#define QUERY_BASE_DEFENSE 0x800
#define QUERY_REASON       0x1000
#define QUERY_REASON_CARD  0x2000
#define QUERY_EQUIP_CARD   0x4000
#define QUERY_TARGET_CARD  0x8000
#define QUERY_OVERLAY_CARD 0x10000
#define QUERY_COUNTERS     0x20000
#define QUERY_OWNER        0x40000
#define QUERY_STATUS       0x80000
#define QUERY_IS_PUBLIC    0x100000
#define QUERY_LSCALE       0x200000
#define QUERY_RSCALE       0x400000
#define QUERY_LINK         0x800000
#define QUERY_IS_HIDDEN    0x1000000
#define QUERY_COVER        0x2000000
#define QUERY_END          0x80000000

struct LocInfo
{
	static constexpr std::size_t SIZE = 1U + 1U + 4U + 4U;
	uint8_t con;  // Controller
	uint8_t loc;  // Location
	uint32_t seq; // Sequence
	uint32_t pos; // Position
};

struct Query
{
	uint32_t flags;
	uint32_t code;
	uint32_t pos;
	uint32_t alias;
	uint32_t type;
	uint32_t level;
	uint32_t rank;
	uint32_t link;
	uint32_t attribute;
	uint64_t race;
	int32_t attack;
	int32_t defense;
	int32_t bAttack;
	int32_t bDefense;
	uint32_t reason;
	uint8_t owner;
	uint32_t status;
	uint8_t isPublic;
	uint32_t lscale;
	uint32_t rscale;
	uint32_t linkMarker;
	LocInfo reasonCard;
	LocInfo equipCard;
	uint8_t isHidden;
	uint32_t cover;
	std::vector<LocInfo> targets;
	std::vector<uint32_t> overlays;
	std::vector<uint32_t> counters;
};

struct QuerySingleRequest
{
	uint8_t con;
	uint32_t loc;
	uint32_t seq;
	uint32_t flags;
};

struct QueryLocationRequest
{
	uint8_t con;
	uint32_t loc;
	uint32_t flags;
};

using QueryRequest = std::variant<QuerySingleRequest, QueryLocationRequest>;

#endif
