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
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    emailVerified: { type: Boolean, default: true },
    subscriptionTier: { type: String, default: 'free' },
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

// ========== EDIBLE FOODS DATABASE ==========
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
    console.log('analyzeWithGoogleVision called, image length:', imageBase64 ? imageBase64.length : 0);
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    const base64Image = imageBase64.split(',')[1];
    const requestBody = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: 'LABEL_DETECTION', maxResults: 30 }]
        }]
    };
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        console.log('Vision API response status:', response.status);
        const data = await response.json();
        if (!data.responses || !data.responses[0].labelAnnotations) {
            console.log('No label annotations found.');
            return [];
        }
        const allLabels = data.responses[0].labelAnnotations.map(label => label.description.toLowerCase());
        console.log('All labels:', allLabels);
        const ingredients = new Set();
        for (const label of allLabels) {
            if (EDIBLE_FOODS.has(label)) {
                ingredients.add(label);
                console.log(`Matched: ${label}`);
            } else {
                let matched = false;
                for (const food of EDIBLE_FOODS) {
                    if (label.includes(food)) {
                        ingredients.add(food);
                        console.log(`Partial match: "${label}" -> "${food}"`);
                        matched = true;
                        break;
                    }
                }
                if (!matched) console.log(`Ignored: ${label}`);
            }
        }
        const result = [...ingredients];
        console.log('Final ingredients:', result);
        return result;
    } catch (error) {
        console.error('Vision API error:', error);
        return [];
    }
}

// ========== RECIPE DATABASE ==========
const recipeDatabase = [
    { name: "🍗 Herb Roasted Chicken", calories: 425, prep: 45, protein: 38, required: ["chicken", "olive oil", "garlic", "onion"], optional: ["carrot", "potato", "rosemary", "thyme"], instructions: ["Preheat oven to 425°F", "Season chicken", "Roast 20-25 min"], image: "https://www.themealdb.com/images/media/meals/wyrqqq1468233628.jpg", isComplete: true },
    { name: "🍤 Garlic Lemon Shrimp", calories: 380, prep: 25, protein: 32, required: ["shrimp", "garlic", "olive oil", "lemon"], optional: ["parsley", "rice", "butter"], instructions: ["Sauté shrimp", "Add garlic and lemon"], image: "https://www.themealdb.com/images/media/meals/uxpqot1511553767.jpg", isComplete: true },
    { name: "🥑 Creamy Avocado Pasta", calories: 520, prep: 20, protein: 14, required: ["pasta", "avocado", "garlic", "olive oil"], optional: ["lemon", "basil", "spinach", "parmesan"], instructions: ["Cook pasta", "Blend avocado, garlic, oil", "Toss"], image: "https://www.themealdb.com/images/media/meals/uttuxy1511382180.jpg", isComplete: true },
    { name: "🥣 Hearty Lentil Soup", calories: 320, prep: 45, protein: 18, required: ["lentils", "onion", "garlic", "carrot"], optional: ["celery", "tomato", "spinach", "thyme"], instructions: ["Sauté vegetables", "Add lentils and broth", "Simmer 25-30 min"], image: "https://www.themealdb.com/images/media/meals/rvxxuy1468312893.jpg", isComplete: true },
    { name: "🍳 Mediterranean Breakfast Skillet", calories: 450, prep: 20, protein: 24, required: ["eggs", "onion", "olive oil"], optional: ["bell pepper", "spinach", "tomato", "feta", "potato"], instructions: ["Sauté onion and peppers", "Add spinach", "Crack eggs", "Cover and cook"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: true },
    { name: "🌮 Spicy Black Bean Tacos", calories: 380, prep: 15, protein: 16, required: ["black beans", "onion", "garlic", "tortillas"], optional: ["avocado", "lettuce", "tomato", "cheese", "cumin"], instructions: ["Sauté onion and garlic", "Add beans and cumin", "Warm tortillas", "Fill"], image: "https://www.themealdb.com/images/media/meals/uvuyxu1503067369.jpg", isComplete: true },
    { name: "🐟 Lemon Herb Baked Salmon", calories: 410, prep: 20, protein: 35, required: ["salmon", "olive oil", "garlic", "lemon"], optional: ["dill", "asparagus", "broccoli"], instructions: ["Season salmon", "Top with lemon", "Bake 12-15 min"], image: "https://www.themealdb.com/images/media/meals/upxwqw1513602486.jpg", isComplete: true },
    { name: "🍝 Quick Tomato Basil Pasta", calories: 480, prep: 20, protein: 12, required: ["pasta", "canned tomatoes", "garlic", "olive oil"], optional: ["onion", "basil", "parmesan", "red pepper flakes"], instructions: ["Cook pasta", "Sauté garlic", "Add tomatoes, simmer", "Toss"], image: "https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg", isComplete: true },
    { name: "🍚 Coconut Curry Vegetables", calories: 420, prep: 30, protein: 8, required: ["coconut milk", "onion", "garlic", "curry powder"], optional: ["sweet potato", "carrot", "spinach", "chickpeas"], instructions: ["Sauté onion and garlic", "Add curry powder", "Add coconut milk and vegetables", "Simmer"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: true }
];

function findMatchingRecipes(ingredients, mode) {
    const ingredientSet = ingredients.map(i => i.toLowerCase());
    const results = [];
    for (const recipe of recipeDatabase) {
        const requiredMatch = recipe.required.every(req => 
            ingredientSet.some(ing => ing.includes(req) || req.includes(ing))
        );
        if (mode === 'strict' && !requiredMatch) continue;
        if (mode === 'flexible') {
            const presentCount = recipe.required.filter(req => 
                ingredientSet.some(ing => ing.includes(req) || req.includes(ing))
            ).length;
            if (presentCount < Math.ceil(recipe.required.length / 2)) continue;
        }
        const matchScore = recipe.required.filter(req => 
            ingredientSet.some(ing => ing.includes(req) || req.includes(ing))
        ).length;
        results.push({ ...recipe, matchScore });
    }
    results.sort((a, b) => b.matchScore - a.matchScore);
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
            optInPromotions: optInPromotions !== false
        });
        await user.save();
        const token = jwt.sign({ userId: user._id, email: user.email, tier: user.subscriptionTier }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, subscriptionTier: user.subscriptionTier } });
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
        console.log('Received images zones:', Object.keys(images));
        const results = {};
        for (const [zone, imageBase64] of Object.entries(images)) {
            if (imageBase64) {
                console.log(`Processing zone: ${zone}, image length: ${imageBase64.length}`);
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

// ========== RECIPE SEARCH ENDPOINT ==========
app.post('/api/search-recipes', async (req, res) => {
    try {
        const { ingredients, goal, mode } = req.body;
        if (!ingredients || ingredients.length === 0) {
            return res.json({ recipes: [] });
        }
        const spoonacularKey = process.env.SPOONACULAR_API_KEY;
        if (spoonacularKey && spoonacularKey !== 'MONEY') {
            try {
                const ingredientString = ingredients.join(',');
                const response = await fetch(`https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(ingredientString)}&number=12&ranking=1&apiKey=${spoonacularKey}`);
                const data = await response.json();
                if (data && data.length) {
                    const recipes = await Promise.all(data.slice(0, 12).map(async (item) => {
                        const detailRes = await fetch(`https://api.spoonacular.com/recipes/${item.id}/information?apiKey=${spoonacularKey}`);
                        const detail = await detailRes.json();
                        return {
                            name: item.title,
                            calories: Math.round(detail.nutrition?.nutrients?.find(n => n.name === 'Calories')?.amount || 400),
                            prep: detail.readyInMinutes || 30,
                            protein: Math.round(detail.nutrition?.nutrients?.find(n => n.name === 'Protein')?.amount || 20),
                            instructions: detail.instructions ? detail.instructions.split('. ').filter(s => s.length > 20).slice(0, 6) : ["Instructions not available"],
                            isComplete: item.missedIngredientCount === 0,
                            image: detail.image,
                            missing_ingredients: item.missedIngredients.map(i => i.name)
                        };
                    }));
                    return res.json({ recipes });
                }
            } catch (spoonError) {
                console.error('Spoonacular error:', spoonError);
            }
        }
        const matchedRecipes = findMatchingRecipes(ingredients, mode);
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
