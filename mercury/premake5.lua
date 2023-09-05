-- premake5.lua
include "dependencies/conandeps.premake5.lua"

workspace "MercuryIntegrator"
  configurations { "Debug", "Release" }
  architecture "x64"

  project "MercuryIntegrator"
    kind "ConsoleApp"
    language "C++"
    cppdialect "C++20"

    targetdir "."
    objdir "build/%{cfg.buildcfg}/obj"
  
    location "./src"
    files { "%{prj.location}/**.h", "%{prj.location}/**.cpp" }


    filter "configurations:Debug"
        defines { "DEBUG" }
        symbols "On"
    filter {}

    filter "configurations:Release"
        defines { "NDEBUG" }
        optimize "On"    
    filter {}

    -- Agregar la configuración para las librerías de OCGCore
    filter "configurations:Debug or Release"
        libdirs { "../libs" }
        links { "event", "freetype", "lua", "sqlite3" }
    filter {}

    conan_setup("release_x86_64")
