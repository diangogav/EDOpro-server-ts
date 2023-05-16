#include "FileReader.h"

std::vector<char> FileReader::read(const char* filename) {
  std::ifstream file(filename, std::ios::ate);  // Abre el archivo en modo lectura y se posiciona al final
  std::streamsize length = file.tellg();  // Obtiene la longitud del archivo

  // Verificar si ocurrió un error al abrir el archivo
  if (length == -1) {
    // Manejar el error apropiadamente...
    return std::vector<char>();  // Devuelve un vector vacío en caso de error
  }

  file.seekg(0, std::ios::beg);  // Se posiciona al inicio del archivo

  // Crear un vector para almacenar el contenido del archivo
  std::vector<char> buffer(length);

  // Leer el contenido del archivo en el vector
  file.read(buffer.data(), length);

  // Cerrar el archivo
  file.close();

  return buffer;
}
