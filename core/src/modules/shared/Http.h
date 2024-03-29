#ifndef HTTP_H
#define HTTP_H

#include <vector>
#include <string>

class Http {
public:
  static std::vector<char> get(const std::string& url);

private:
  static size_t write_data(char *ptr, size_t size, size_t nmemb, void *userdata);
};

#endif
