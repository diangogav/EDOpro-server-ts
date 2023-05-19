#include "CommandLineArrayParser.h"

CommandLineArrayParser::CommandLineArrayParser(std::string stringArrayOfNumbers) : stringArrayOfNumbers(stringArrayOfNumbers) {}

std::vector<int> CommandLineArrayParser::parse() {
    if (stringArrayOfNumbers.front() == '[' && stringArrayOfNumbers.back() == ']') {
        stringArrayOfNumbers = stringArrayOfNumbers.substr(1, stringArrayOfNumbers.size() - 2);
    }

    std::vector<int> numbers;
    std::istringstream iss(stringArrayOfNumbers);
    std::string number;
    while (std::getline(iss, number, ',')) {
        try {
            int num = std::stoi(number);
            numbers.push_back(num);
        } catch (std::exception const& e) {
            exit(1);
        }
    }

    return numbers;
}