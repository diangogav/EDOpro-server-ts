cmake_minimum_required(VERSION 3.18)

project(CoreIntegrator LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Boost REQUIRED COMPONENTS system)
find_package(CURL REQUIRED)
find_package(jsoncpp REQUIRED)
find_package(nlohmann_json REQUIRED)
find_package(SQLite3 REQUIRED)
find_package(Threads REQUIRED)

file(GLOB_RECURSE SOURCES "src/*.cpp" "src/*.h")

add_executable(CoreIntegrator ${SOURCES})

target_link_libraries(CoreIntegrator PRIVATE
    Boost::system
    CURL::libcurl
    jsoncpp
    nlohmann_json::nlohmann_json
    SQLite::SQLite3
    Threads::Threads
    dl
)

# Output binary to the core directory as per original behavior
set_target_properties(CoreIntegrator PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}")
