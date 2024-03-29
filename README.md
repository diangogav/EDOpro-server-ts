# TSPRO 🎮


![Logo](https://raw.githubusercontent.com/diangogav/EDOpro-server-ts/main/assets/1.svg)

Welcome to TSPRO, another server for creating Yu-Gi-Oh! matches using the EDOPro core! But this time, we focus on the scalability of the code, allowing for easy implementation of new features related to the data generated during the duels.

## Features ✨

- 🏰 Room creation through the EDOPro lobby.
- 🔌 Reconnection to the match in case of closure or disconnection.
- 📊 Collection of duel data for generating statistics.
- 🚀 Core isolation for each match.

## Installation Requirements 📋

- Conan (2.0.6): [conan](https://conan.io/)
- Node.js (18.16.0): Make sure you have Node.js installed on your system. You can download the latest stable version from [https://nodejs.org](https://nodejs.org). 📥🚀

## Conan Installation Guide 🚀

1. Install `Python` and `pip`

```bash
apt install python3 python3-pip -y
```

2. Install Conan through pip

```bash
pip install conan
```

3. Configure the `conan` profile

```bash
conan profile detect
```

## C++ Compilation Guide 🛠️

1. Clone this repository to your local machine using the following command:

```bash
git clone https://github.com/tuusuario/edo-pro-server.git
```

2. Navigate to the core folder, which contains all the C++ code of the project.

3. Download `premake` and copy it to the path from step 2 (This step only needs to be done once)

```bash
wget https://github.com/premake/premake-core/releases/download/v5.0.0-beta2/premake-5.0.0-beta2-linux.tar.gz
```

```
 tar -zxvf premake-5.0.0-beta2-linux.tar.gz
```

4.  Install the dependencies using `Conan`

```bash
conan install . --build missing --output-folder=./dependencies --options=libcurl/8.6.0:shared=True
```

5.  Generate the `make` file using `premake5` downloaded in step 3

```bash
./premake5 gmake
```

6.  Build the binary:

```bash
make
```

## Starting the Server

1. Navigate to the root of the project.

2. Install the dependencies using `npm`:

```bash
npm install
```

3. Clone card databases in the root folder:
```
git clone https://github.com/ProjectIgnis/BabelCDB.git databases
```

4. Clone banlists in the root folder:
```
git clone git clone https://github.com/ProjectIgnis/LFLists banlists-project-ignis banlists
```

5. Clone card scripts inside the core folder:
```
git clone https://github.com/ProjectIgnis/CardScripts.git scripts
```

6. Compile the project:

```bash
npm run build
```

7. Start the project:

```bash
npm start
```

## Running with Docker 🐳

If you prefer to use Docker to run the project, you can follow these steps:

1. Make sure you have Docker installed on your system. You can download and install Docker from [https://www.docker.com](https://www.docker.com).

2. Build the Docker image with the following command:
```
docker build -t <image-name> <path-to-dockerfile>
```

3. Run the Docker container:
```
docker run -p 7911:7911 -p 7922:7922 <image-name>
```

## Notes and thanks

- This repository is based on https://github.com/DyXel/Multirole
- Special thanks to @Dyxel
