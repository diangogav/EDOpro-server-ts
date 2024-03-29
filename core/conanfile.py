from conan import ConanFile

class CoreIntegrator(ConanFile):
  settings = "os", "compiler", "build_type", "arch"
  generators = "PremakeDeps"

  def requirements(self):
    self.requires("boost/1.82.0")
    self.requires("sqlite3/3.42.0")
    self.requires("jsoncpp/1.9.5")
    self.requires("nlohmann_json/3.11.2")
    self.requires("libcurl/8.6.0")
