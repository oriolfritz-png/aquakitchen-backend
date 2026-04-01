const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// CORS – allow all origins for development
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ========== MONGODB CONNECTION ==========
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ========== USER SCHEMA ==========
const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    emailVerified: { type: Boolean, default: true }, // auto-verified
    subscriptionTier: { type: String, default: 'free' }, // 'free', 'pro', 'premium'
    optInPromotions: { type: Boolean, default: true },
    foodHabits: [{
        ingredient: String,
        timestamp: Date,
        goal: String
    }],
    createdAt: { type: Date, default: Date.now },
    lastActive: Date
});
const User = mongoose.model('User', UserSchema);

// ========== GOOGLE VISION INGREDIENT DETECTION ==========
async function analyzeWithGoogleVision(imageBase64) {
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    const base64Image = imageBase64.split(',')[1];
    const requestBody = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: 'LABEL_DETECTION', maxResults: 20 }]
        }]
    };
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
    const data = await response.json();
    if (!data.responses || !data.responses[0].labelAnnotations) return [];
    const foodKeywords = [
        'food', 'vegetable', 'fruit', 'meat', 'dairy', 'chicken', 'beef', 'pork', 'fish',
        'rice', 'pasta', 'bread', 'tomato', 'onion', 'garlic', 'potato', 'carrot',
        'apple', 'banana', 'orange', 'lemon', 'avocado', 'cheese', 'milk', 'egg',
        'butter', 'oil', 'salt', 'pepper', 'spice', 'herb'
    ];
    const ingredients = data.responses[0].labelAnnotations
        .filter(label => foodKeywords.some(keyword => label.description.toLowerCase().includes(keyword)))
        .map(label => label.description.toLowerCase());
    return [...new Set(ingredients)];
}

// ========== AUTH ROUTES ==========
// Registration – immediately verified, no email
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, optInPromotions } = req.body;
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already registered' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({
            firstName, lastName, email, password: hashed,
            emailVerified: true, // auto-verified
            optInPromotions: optInPromotions !== false
        });
        await user.save();
        const token = jwt.sign({ userId: user._id, email: user.email, tier: user.subscriptionTier }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                subscriptionTier: user.subscriptionTier
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
        user.lastActive = new Date();
        await user.save();
        const token = jwt.sign({ userId: user._id, email: user.email, tier: user.subscriptionTier }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                subscriptionTier: user.subscriptionTier
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update subscription tier (for demo – no payment)
app.post('/api/update-tier', async (req, res) => {
    try {
        const { userId, tier } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.subscriptionTier = tier;
        await user.save();
        res.json({ success: true, user: { id: user._id, subscriptionTier: user.subscriptionTier } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== IMAGE ANALYSIS ENDPOINT (uses Google Vision) ==========
app.post('/api/analyze-images', async (req, res) => {
    try {
        const { images } = req.body;
        const results = {};
        for (const [zone, imageBase64] of Object.entries(images)) {
            if (imageBase64) {
                results[zone] = await analyzeWithGoogleVision(imageBase64);
            } else {
                results[zone] = [];
            }
        }
        res.json(results);
    } catch (error) {
        console.error('Vision API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== RECIPE SEARCH ENDPOINT (demo) ==========
app.post('/api/search-recipes', async (req, res) => {
    try {
        const { ingredients, goal, mode } = req.body;
        // Demo recipes – you can expand later
        const demoRecipes = [
            { name: "🍗 Herb Roasted Chicken", calories: 425, prep: 45, protein: 38, isComplete: true, instructions: ["Preheat oven to 425°F", "Season chicken", "Roast 20-25 min"], image: "https://www.themealdb.com/images/media/meals/wyrqqq1468233628.jpg" },
            { name: "🍤 Garlic Lemon Shrimp", calories: 380, prep: 25, protein: 32, isComplete: true, instructions: ["Sauté shrimp", "Add garlic and lemon"], image: "https://www.themealdb.com/images/media/meals/uxpqot1511553767.jpg" },
            { name: "🥑 Creamy Avocado Pasta", calories: 520, prep: 20, protein: 14, isComplete: true, instructions: ["Cook pasta", "Blend avocado, garlic, oil", "Toss"], image: "https://www.themealdb.com/images/media/meals/uttuxy1511382180.jpg" }
        ];
        res.json({ recipes: demoRecipes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== TEST ENDPOINT ==========
app.get('/', (req, res) => {
    res.json({ message: 'AquaKitchen API is running (demo mode)!' });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 AquaKitchen API running on port ${PORT}`);
    console.log(`Test: http://localhost:${PORT}`);
});
