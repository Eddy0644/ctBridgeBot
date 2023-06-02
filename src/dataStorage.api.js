const fs = require('fs').promises;

class DataStorage {
    constructor(filename) {
        this.filename = filename;
    }

    async get(key) {
        const data = await this.readDataFromFile();
        return data[key] || null;
    }

    async set(key, value) {
        const data = await this.readDataFromFile();
        data[key] = value;
        await this.writeDataToFile(data);
    }

    async readDataFromFile() {
        try {
            const fileContents = await fs.readFile(this.filename, 'utf8');
            return JSON.parse(fileContents);
        } catch (err) {
            // If the file doesn't exist or is empty, return an empty object
            return {};
        }
    }

    async writeDataToFile(data) {
        const fileContents = JSON.stringify(data);
        await fs.writeFile(this.filename, fileContents, 'utf8');
    }
}

module.exports = DataStorage;
