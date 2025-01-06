<h1 align="center">Evolution Server 🎮</h1>


![Logo](https://raw.githubusercontent.com/diangogav/EDOpro-server-ts/main/assets/1.svg)

Welcome to Evolution Server, a versatile platform for creating Yu-Gi-Oh! matches, fully compatible with EDOPro, Koishi, and YGO Mobile! But this time, we focus on the scalability of the code, allowing for easy implementation of new features related to the data generated during the duels.

## Features ✨

- 🏰 Room creation through the EDOPro lobby.
- 📱 Duel creation supported through Koishi and YGO Mobile.
- 🧪 Cross-client duels between different platforms - (Experimental).
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

## Installation Guide 🚀

### Step 1: Clone the repository
Clone this repository to your local machine using the following command:
```bash
git clone --recursive https://github.com/diangogav/EDOpro-server-ts
```

### Step 2: Clone required repositories
Run the `clone_repositories.sh` script to clone all necessary repositories:
```bash
bash clone_repositories.sh
```

### Step 3: Build the Core Integrator
Run the `build_core_integrator.sh` script to build the C++ components:
```bash
bash build_core_integrator.sh
```

### Step 4: Install the project dependencies using `npm`:
```bash
npm install
```

### Step 5: Start the project
```bash
npm run dev
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
