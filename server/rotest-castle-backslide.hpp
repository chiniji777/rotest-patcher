#pragma once

#include <cstdint>
#include <cstring>

namespace rotest {


inline uint32_t castle_skill_nocast(uint16_t skill_id, uint32_t original, const char* map_name) noexcept {
	if (skill_id != 150 || map_name == nullptr)
		return original;

	const bool allowed =
		std::strcmp(map_name, "prtg_cas01") == 0 ||
		std::strcmp(map_name, "prtg_cas02") == 0 ||
		std::strcmp(map_name, "prtg_cas03") == 0 ||
		std::strcmp(map_name, "prtg_cas04") == 0 ||
		std::strcmp(map_name, "prtg_cas05") == 0 ||
		std::strcmp(map_name, "aldeg_cas01") == 0 ||
		std::strcmp(map_name, "aldeg_cas02") == 0 ||
		std::strcmp(map_name, "aldeg_cas03") == 0 ||
		std::strcmp(map_name, "aldeg_cas04") == 0 ||
		std::strcmp(map_name, "aldeg_cas05") == 0 ||
		std::strcmp(map_name, "gefg_cas01") == 0 ||
		std::strcmp(map_name, "gefg_cas02") == 0 ||
		std::strcmp(map_name, "gefg_cas03") == 0 ||
		std::strcmp(map_name, "gefg_cas04") == 0 ||
		std::strcmp(map_name, "gefg_cas05") == 0 ||
		std::strcmp(map_name, "payg_cas01") == 0 ||
		std::strcmp(map_name, "payg_cas02") == 0 ||
		std::strcmp(map_name, "payg_cas03") == 0 ||
		std::strcmp(map_name, "payg_cas04") == 0 ||
		std::strcmp(map_name, "payg_cas05") == 0;

	if (allowed)
		return original & ~4u;

	return original;
}

}
