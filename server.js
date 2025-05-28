const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.post('/donate', (req, res) => {
    try {
        const { key, data } = req.body;
        
        // Create a timestamped filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${timestamp}_${key}.json`;
        const filepath = path.join(uploadsDir, filename);

        // Save the data to a file
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        
        console.log(`Saved data to ${filepath}`);
        res.json({ success: true, filepath });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 4321;

// Handle errors gracefully
process.on('uncaughtException', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please choose a different port or stop the process using that port.`);
    } else {
        console.error('Uncaught Exception:', error);
    }
    process.exit(1);
});

try {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Files will be saved to: ${uploadsDir}`);
    });
} catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
}
