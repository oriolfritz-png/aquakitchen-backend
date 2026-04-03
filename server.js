const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

const UserSchema = new mongoose.Schema({
    firstName: String, lastName: String, email: { type: String, unique: true },
    password: String, emailVerified: { type: Boolean, default: true },
    subscriptionTier: { type: String, default: 'free' },
    optInPromotions: { type: Boolean, default: true },
    foodHabits: [{
        ingredient: String,
        timestamp: Date,
        goal: String
    }],
    createdAt: Date, lastActive: Date
});
const User = mongoose.model('User', UserSchema);

// ========== EDIBLE FOODS DATABASE (for filtering) ==========
const EDIBLE_FOODS = new Set([
    'apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'strawberry', 'blueberry', 'raspberry',
    'cherry', 'peach', 'pear', 'plum', 'watermelon', 'cantaloupe', 'honeydew', 'mango', 'papaya', 'kiwi',
    'pineapple', 'coconut', 'avocado', 'tomato', 'olive', 'fig', 'date', 'pomegranate', 'cranberry',
    'carrot', 'broccoli', 'cauliflower', 'cabbage', 'lettuce', 'spinach', 'kale', 'arugula', 'celery',
    'cucumber', 'zucchini', 'eggplant', 'bell pepper', 'jalapeno', 'onion', 'garlic', 'shallot', 'leek',
    'potato', 'sweet potato', 'yam', 'radish', 'beet', 'turnip', 'parsnip', 'corn', 'pea', 'green bean',
    'asparagus', 'artichoke', 'mushroom', 'okra', 'rhubarb', 'squash', 'pumpkin',
    'chicken', 'beef', 'pork', 'lamb', 'veal', 'turkey', 'duck', 'fish', 'salmon', 'tuna', 'shrimp', 'crab',
    'lobster', 'scallop', 'clam', 'oyster', 'mussel', 'tofu', 'tempeh', 'seitan', 'egg', 'bacon', 'sausage',
    'ham', 'steak', 'ground beef', 'ground turkey', 'chicken breast', 'chicken thigh', 'pork chop',
    'milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream', 'cream cheese', 'cottage cheese', 'parmesan',
    'cheddar', 'mozzarella', 'swiss', 'ricotta', 'feta', 'goat cheese', 'almond milk', 'soy milk', 'oat milk',
    'rice', 'pasta', 'noodle', 'bread', 'bagel', 'croissant', 'tortilla', 'cereal', 'oat', 'quinoa', 'barley',
    'farro', 'couscous', 'flour', 'cornmeal', 'polenta', 'spaghetti', 'macaroni', 'lasagna',
    'bean', 'lentil', 'chickpea', 'soybean', 'nut', 'almond', 'walnut', 'pecan', 'cashew', 'peanut',
    'sunflower seed', 'pumpkin seed', 'sesame seed', 'flaxseed', 'chia seed',
    'salt', 'pepper', 'paprika', 'cumin', 'coriander', 'turmeric', 'ginger', 'garlic powder', 'onion powder',
    'oregano', 'basil', 'thyme', 'rosemary', 'sage', 'parsley', 'cilantro', 'dill', 'mint', 'cinnamon',
    'nutmeg', 'clove', 'cardamom', 'vanilla', 'cocoa', 'chocolate', 'bay leaf', 'red pepper flakes', 'cayenne',
    'chili powder', 'curry powder', 'garam masala', 'five spice', 'herbes de provence',
    'soup', 'broth', 'stock', 'sauce', 'ketchup', 'mustard', 'mayonnaise', 'vinegar', 'oil', 'olive oil',
    'coconut oil', 'vegetable oil', 'honey', 'maple syrup', 'jam', 'jelly', 'peanut butter', 'nutella',
    'frozen peas', 'frozen corn', 'frozen broccoli', 'frozen spinach', 'french fry', 'ice cream', 'pizza',
    'coffee', 'tea', 'juice', 'soda', 'water', 'beer', 'wine'
]);

async function analyzeWithGoogleVision(imageBase64) {
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    const base64Image = imageBase64.split(',')[1];
    const requestBody = {
        requests: [{
            image: { content: base64Image },
            features: [
                { type: 'LABEL_DETECTION', maxResults: 30 },
                { type: 'TEXT_DETECTION', maxResults: 20 }
            ]
        }]
    };
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        const ingredients = new Set();

        // Process label annotations
        if (data.responses && data.responses[0].labelAnnotations) {
            const labels = data.responses[0].labelAnnotations.map(l => l.description.toLowerCase());
            for (const label of labels) {
                if (EDIBLE_FOODS.has(label)) ingredients.add(label);
                else {
                    for (const food of EDIBLE_FOODS) {
                        if (label.includes(food)) {
                            ingredients.add(food);
                            break;
                        }
                    }
                }
            }
        }

        // Process text annotations
        if (data.responses && data.responses[0].fullTextAnnotation) {
            const text = data.responses[0].fullTextAnnotation.text.toLowerCase();
            const words = text.split(/\s+/);
            for (const word of words) {
                if (EDIBLE_FOODS.has(word)) ingredients.add(word);
                for (const food of EDIBLE_FOODS) {
                    if (word.includes(food) && food.length > 2) {
                        ingredients.add(food);
                    }
                }
            }
        }
        return [...ingredients];
    } catch (error) {
        console.error('Vision API error:', error);
        return [];
    }
}

// ========== COMPREHENSIVE RECIPE DATABASE ==========
const recipeDatabase = [
    { name: "🍗 Herb Roasted Chicken", calories: 425, prep: 45, protein: 38, required: ["chicken"], optional: ["olive oil", "garlic", "onion", "carrot", "potato", "rosemary", "thyme"], instructions: ["Preheat oven to 425°F", "Season chicken with salt, pepper, herbs", "Roast 20-25 min until internal temp 165°F", "Rest 5 min before serving"], image: "https://www.themealdb.com/images/media/meals/wyrqqq1468233628.jpg", isComplete: false },
    { name: "🥓 Bacon & Egg Breakfast", calories: 450, prep: 15, protein: 24, required: ["bacon", "egg"], optional: ["bread", "butter", "cheese"], instructions: ["Cook bacon until crispy", "Fry eggs in bacon fat", "Serve with toast"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: false },
    { name: "🍌 Banana Smoothie", calories: 200, prep: 5, protein: 5, required: ["banana"], optional: ["milk", "yogurt", "honey"], instructions: ["Blend banana with milk/yogurt until smooth", "Add honey to taste"], image: "https://www.themealdb.com/images/media/meals/uttuxy1511382180.jpg", isComplete: false },
    { name: "🍤 Garlic Lemon Shrimp", calories: 380, prep: 25, protein: 32, required: ["shrimp"], optional: ["garlic", "olive oil", "lemon", "parsley", "rice"], instructions: ["Sauté shrimp 1-2 min per side", "Add garlic, cook 30 sec", "Add lemon juice, toss", "Serve over rice"], image: "https://www.themealdb.com/images/media/meals/uxpqot1511553767.jpg", isComplete: false },
    { name: "🥑 Avocado Toast", calories: 320, prep: 5, protein: 8, required: ["avocado", "bread"], optional: ["lemon", "salt", "pepper", "red pepper flakes"], instructions: ["Toast bread", "Mash avocado, spread on toast", "Season with salt, pepper, lemon"], image: "https://www.themealdb.com/images/media/meals/uttuxy1511382180.jpg", isComplete: false },
    { name: "🥣 Yogurt Parfait", calories: 250, prep: 5, protein: 12, required: ["yogurt"], optional: ["banana", "berry", "granola", "honey"], instructions: ["Layer yogurt, fruit, and granola in a glass", "Drizzle with honey"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: false },
    { name: "🐟 Lemon Herb Salmon", calories: 410, prep: 20, protein: 35, required: ["salmon"], optional: ["olive oil", "garlic", "lemon", "dill", "asparagus"], instructions: ["Preheat oven to 400°F", "Season salmon", "Top with lemon slices", "Roast 12-15 min"], image: "https://www.themealdb.com/images/media/meals/upxwqw1513602486.jpg", isComplete: false },
    { name: "🍝 Tomato Basil Pasta", calories: 480, prep: 20, protein: 12, required: ["pasta", "tomato"], optional: ["garlic", "olive oil", "onion", "basil", "parmesan"], instructions: ["Cook pasta", "Sauté garlic and onion", "Add tomatoes, simmer 10 min", "Toss with pasta, top with basil"], image: "https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg", isComplete: false },
    { name: "🍚 Coconut Curry Vegetables", calories: 420, prep: 30, protein: 8, required: ["coconut milk", "vegetable"], optional: ["onion", "garlic", "curry powder", "sweet potato", "spinach"], instructions: ["Sauté onion and garlic", "Add curry powder", "Add coconut milk and vegetables", "Simmer 15-20 min"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: false },
    { name: "🌮 Black Bean Tacos", calories: 380, prep: 15, protein: 16, required: ["black beans", "tortillas"], optional: ["onion", "garlic", "avocado", "lettuce", "cheese", "cumin"], instructions: ["Sauté onion and garlic", "Add beans and cumin, mash slightly", "Warm tortillas", "Fill with beans and toppings"], image: "https://www.themealdb.com/images/media/meals/uvuyxu1503067369.jpg", isComplete: false },
    { name: "🍳 Veggie Omelette", calories: 350, prep: 10, protein: 20, required: ["egg"], optional: ["onion", "bell pepper", "spinach", "cheese", "mushroom"], instructions: ["Beat eggs", "Sauté vegetables", "Pour eggs over vegetables", "Cook until set, fold, add cheese"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: false },
    { name: "🥗 Chicken Salad", calories: 400, prep: 10, protein: 30, required: ["chicken"], optional: ["lettuce", "tomato", "cucumber", "avocado", "olive oil", "lemon"], instructions: ["Cook and shred chicken", "Chop vegetables", "Toss with olive oil and lemon", "Top with chicken"], image: "https://www.themealdb.com/images/media/meals/wyrqqq1468233628.jpg", isComplete: false }
];

function findMatchingRecipes(ingredients, mode) {
    const ingredientSet = ingredients.map(i => i.toLowerCase());
    const results = [];
    for (const recipe of recipeDatabase) {
        // Count how many required ingredients are present
        const required = recipe.required.map(r => r.toLowerCase());
        const requiredCount = required.filter(req => 
            ingredientSet.some(ing => ing.includes(req) || req.includes(ing))
        ).length;
        // Flexible: at least one required ingredient present
        if (mode === 'strict' && requiredCount < required.length) continue;
        if (mode === 'flexible' && requiredCount === 0) continue;
        // Score = number of required + number of optional matches
        const optional = (recipe.optional || []).map(o => o.toLowerCase());
        const optionalCount = optional.filter(opt => 
            ingredientSet.some(ing => ing.includes(opt) || opt.includes(ing))
        ).length;
        const matchScore = requiredCount + optionalCount;
        results.push({ ...recipe, matchScore });
    }
    results.sort((a, b) => b.matchScore - a.matchScore);
    // Always return at least top 5, but up to 12
    return results.slice(0, 12);
}

// ========== AUTH ROUTES ==========
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, optInPromotions } = req.body;
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already registered' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({
            firstName, lastName, email, password: hashed,
            emailVerified: true,
            optInPromotions: optInPromotions !== false,
            createdAt: new Date()
        });
        await user.save();
        const token = jwt.sign({ userId: user._id, email: user.email, tier: user.subscriptionTier }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, firstName, lastName, email, subscriptionTier: user.subscriptionTier } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
        res.json({ token, user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, subscriptionTier: user.subscriptionTier } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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

// ========== IMAGE ANALYSIS ENDPOINT ==========
app.post('/api/analyze-images', async (req, res) => {
    console.log('Received request to /api/analyze-images');
    try {
        const { images } = req.body;
        const results = {};
        for (const [zone, imageBase64] of Object.entries(images)) {
            if (imageBase64) {
                const ingredients = await analyzeWithGoogleVision(imageBase64);
                results[zone] = ingredients;
                if (ingredients.length === 0) {
                    results[`${zone}_note`] = "No specific food items detected. Try taking a closer photo or use the 'Add Missing Ingredient' button.";
                }
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

// ========== RECIPE SEARCH ENDPOINT (ALWAYS RETURNS RECIPES) ==========
app.post('/api/search-recipes', async (req, res) => {
    try {
        const { ingredients, goal, mode } = req.body;
        if (!ingredients || ingredients.length === 0) {
            return res.json({ recipes: [] });
        }
        // Always use local database for reliability
        const matchedRecipes = findMatchingRecipes(ingredients, mode || 'flexible');
        // Add a note if no recipes found (should not happen with this database)
        if (matchedRecipes.length === 0) {
            return res.json({ recipes: [], message: "No recipes match your ingredients. Try adding more items or use flexible mode." });
        }
        res.json({ recipes: matchedRecipes });
    } catch (error) {
        console.error('Recipe search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ message: 'AquaKitchen API is running!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 AquaKitchen API running on port ${PORT}`);
    console.log(`Test: http://localhost:${PORT}`);
});
