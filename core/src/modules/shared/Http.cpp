#include "Http.h"
#include <curl/curl.h>
#include <iostream>

std::vector<char> Http::get(const std::string& url) {
  CURL *curl = curl_easy_init();
  if (curl == nullptr) {
    std::cerr << "Error al inicializar CURL" << std::endl;
    return {};
  }

  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());

  curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);

  std::vector<char> response;
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_data);

  CURLcode res = curl_easy_perform(curl);
  if (res != CURLE_OK) {
    std::cerr << "Error al ejecutar la petición: " << curl_easy_strerror(res) << std::endl;
    curl_easy_cleanup(curl);
    return {};
  }

  curl_easy_cleanup(curl);

  return response;
}

size_t Http::write_data(char *ptr, size_t size, size_t nmemb, void *userdata) {
  std::vector<char> *response_ptr = reinterpret_cast<std::vector<char>*>(userdata);
  response_ptr->insert(response_ptr->end(), ptr, ptr + size * nmemb);
  return size * nmemb;
}
