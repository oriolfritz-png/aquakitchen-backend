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

// ========== ENHANCED GOOGLE VISION - ONLY FOOD ITEMS ==========
async function analyzeWithGoogleVision(imageBase64) {
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
        const data = await response.json();
        if (!data.responses || !data.responses[0].labelAnnotations) return [];

        // Comprehensive list of edible food items
        const foodItems = new Set([
            // Fruits
            'apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'cherry', 'peach', 'pear', 'plum', 'watermelon', 'cantaloupe', 'honeydew', 'mango', 'papaya', 'kiwi', 'pineapple', 'coconut', 'avocado', 'tomato', 'olive',
            // Vegetables
            'carrot', 'broccoli', 'cauliflower', 'cabbage', 'lettuce', 'spinach', 'kale', 'arugula', 'celery', 'cucumber', 'zucchini', 'eggplant', 'pepper', 'bell pepper', 'chili pepper', 'jalapeno', 'onion', 'garlic', 'shallot', 'leek', 'potato', 'sweet potato', 'yam', 'radish', 'beet', 'turnip', 'parsnip', 'corn', 'pea', 'green bean', 'asparagus', 'artichoke', 'mushroom',
            // Meats & Proteins
            'chicken', 'beef', 'pork', 'lamb', 'veal', 'turkey', 'duck', 'fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'scallop', 'tofu', 'tempeh', 'seitan', 'egg', 'bacon', 'sausage', 'ham', 'steak', 'ground beef', 'ground turkey',
            // Dairy & Alternatives
            'milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream', 'cream cheese', 'cottage cheese', 'parmesan', 'cheddar', 'mozzarella', 'swiss', 'almond milk', 'soy milk', 'oat milk',
            // Grains & Starches
            'rice', 'pasta', 'noodle', 'bread', 'bagel', 'croissant', 'tortilla', 'cereal', 'oat', 'quinoa', 'barley', 'farro', 'couscous', 'flour',
            // Legumes & Nuts
            'bean', 'lentil', 'chickpea', 'pea', 'soybean', 'nut', 'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'sunflower seed',
            // Spices & Herbs
            'salt', 'pepper', 'paprika', 'cumin', 'coriander', 'turmeric', 'ginger', 'garlic powder', 'onion powder', 'oregano', 'basil', 'thyme', 'rosemary', 'sage', 'parsley', 'cilantro', 'dill', 'mint', 'cinnamon', 'nutmeg', 'clove', 'cardamom', 'vanilla', 'cocoa', 'chocolate',
            // Canned & Packaged
            'soup', 'broth', 'stock', 'sauce', 'ketchup', 'mustard', 'mayonnaise', 'vinegar', 'oil', 'olive oil', 'coconut oil', 'vegetable oil',
            // Frozen foods
            'frozen', 'ice cream', 'pizza', 'french fry', 'waffle', 'pancake'
        ]);

        // Words to explicitly exclude
        const excludeWords = new Set([
            'appliance', 'kitchen', 'home', 'room', 'furniture', 'counter', 'table', 'refrigerator', 'freezer', 'pantry', 'cabinet', 'shelf', 'drawer', 'door', 'handle', 'light', 'cooking', 'baking', 'roasting', 'frying', 'grilling', 'steaming', 'boiling', 'container', 'package', 'packaging', 'wrapper', 'bag', 'box', 'can', 'jar', 'bottle', 'label', 'brand', 'logo', 'design', 'pattern', 'color', 'yellow', 'red', 'green', 'blue', 'white', 'black', 'brown', 'purple', 'orange', 'pink', 'gray', 'beige', 'wood', 'metal', 'plastic', 'glass', 'ceramic', 'stainless', 'electric', 'digital', 'modern', 'traditional', 'rustic', 'industrial', 'commercial', 'household', 'domestic', 'indoor', 'outdoor', 'backyard', 'garden', 'farm', 'market', 'store', 'grocery', 'supermarket', 'delivery', 'order', 'meal', 'dinner', 'lunch', 'breakfast', 'snack', 'dessert', 'appetizer', 'side dish', 'main course', 'entree', 'salad', 'sandwich', 'wrap', 'burger', 'taco', 'burrito', 'cookie', 'cake', 'pie', 'pastry', 'donut', 'muffin', 'toast', 'oatmeal', 'smoothie', 'juice', 'soda', 'water', 'coffee', 'tea', 'alcohol', 'beer', 'wine', 'spirit', 'liquor', 'cocktail', 'mocktail', 'dip', 'spread', 'jam', 'jelly', 'honey', 'syrup', 'condiment', 'seasoning', 'sugar', 'flour', 'gravy', 'marinade', 'brine', 'pickle', 'relish', 'chutney', 'salsa', 'guacamole', 'hummus', 'pesto', 'aioli', 'tartar', 'cocktail sauce', 'barbecue', 'teriyaki', 'soy sauce', 'worcestershire', 'fish sauce', 'oyster sauce', 'hoisin', 'sriracha', 'hot sauce', 'tabasco', 'chili', 'curry', 'masala', 'tandoori', 'cajun', 'creole'
        ]);

        const allLabels = data.responses[0].labelAnnotations.map(label => label.description.toLowerCase());
        const ingredients = [];
        for (const label of allLabels) {
            // Direct match with food item
            if (foodItems.has(label)) {
                ingredients.push(label);
                continue;
            }
            // Check if label contains a food item (e.g., "chicken breast" contains "chicken")
            let matched = false;
            for (const food of foodItems) {
                if (label.includes(food)) {
                    ingredients.push(label);
                    matched = true;
                    break;
                }
            }
            if (matched) continue;
            // Skip excluded words
            if (excludeWords.has(label)) continue;
            // Skip very short labels
            if (label.length < 3) continue;
            // Last resort: include if it has "food" but not "appliance"
            if (label.includes('food') && !label.includes('appliance')) {
                ingredients.push(label);
            }
        }
        // Remove duplicates and return all
        return [...new Set(ingredients)];
    } catch (error) {
        console.error('Vision API fetch error:', error);
        return [];
    }
}

// ========== RECIPE DATABASE ==========
const recipeDatabase = [
    { name: "🍗 Herb Roasted Chicken", calories: 425, prep: 45, protein: 38, required: ["chicken", "olive oil", "garlic", "onion"], optional: ["carrot", "potato", "rosemary", "thyme"], instructions: ["Preheat oven to 425°F", "Season chicken with salt, pepper, herbs", "Toss vegetables with oil and garlic", "Roast 20-25 min until chicken reaches 165°F", "Rest 5 min before serving"], image: "https://www.themealdb.com/images/media/meals/wyrqqq1468233628.jpg", isComplete: true },
    { name: "🍤 Garlic Lemon Shrimp", calories: 380, prep: 25, protein: 32, required: ["shrimp", "garlic", "olive oil", "lemon"], optional: ["parsley", "rice", "butter"], instructions: ["Pat shrimp dry, season with salt", "Heat oil in skillet", "Sauté shrimp 1-2 min per side, remove", "Add garlic, cook 30 sec", "Add lemon juice and zest, return shrimp", "Garnish with parsley, serve over rice"], image: "https://www.themealdb.com/images/media/meals/uxpqot1511553767.jpg", isComplete: true },
    { name: "🥑 Creamy Avocado Pasta", calories: 520, prep: 20, protein: 14, required: ["pasta", "avocado", "garlic", "olive oil"], optional: ["lemon", "basil", "spinach", "parmesan"], instructions: ["Cook pasta, reserve ½ cup water", "Blend avocado, garlic, oil, lemon until smooth", "Toss pasta with sauce, add pasta water as needed", "Top with basil and cheese"], image: "https://www.themealdb.com/images/media/meals/uttuxy1511382180.jpg", isComplete: true },
    { name: "🥣 Hearty Lentil Soup", calories: 320, prep: 45, protein: 18, required: ["lentils", "onion", "garlic", "carrot"], optional: ["celery", "tomato", "spinach", "thyme"], instructions: ["Sauté onion, carrot, celery 5-7 min", "Add garlic, cook 1 min", "Add lentils, tomatoes, broth", "Simmer 25-30 min until lentils tender", "Stir in spinach, season"], image: "https://www.themealdb.com/images/media/meals/rvxxuy1468312893.jpg", isComplete: true },
    { name: "🍳 Mediterranean Breakfast Skillet", calories: 450, prep: 20, protein: 24, required: ["eggs", "onion", "olive oil"], optional: ["bell pepper", "spinach", "tomato", "feta", "potato"], instructions: ["Sauté onion and peppers 5 min", "Add spinach, cook 2 min", "Make wells, crack eggs", "Cover, cook 4-6 min", "Top with feta"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: true },
    { name: "🌮 Spicy Black Bean Tacos", calories: 380, prep: 15, protein: 16, required: ["black beans", "onion", "garlic", "tortillas"], optional: ["avocado", "lettuce", "tomato", "cheese", "cumin"], instructions: ["Sauté onion and garlic", "Add beans, cumin, mash slightly", "Warm tortillas", "Fill tortillas, top with avocado, lettuce, cheese"], image: "https://www.themealdb.com/images/media/meals/uvuyxu1503067369.jpg", isComplete: true },
    { name: "🐟 Lemon Herb Baked Salmon", calories: 410, prep: 20, protein: 35, required: ["salmon", "olive oil", "garlic", "lemon"], optional: ["dill", "asparagus", "broccoli"], instructions: ["Preheat oven to 400°F", "Season salmon with garlic, herbs", "Top with lemon slices", "Roast 12-15 min", "Serve with roasted vegetables"], image: "https://www.themealdb.com/images/media/meals/upxwqw1513602486.jpg", isComplete: true },
    { name: "🍝 Quick Tomato Basil Pasta", calories: 480, prep: 20, protein: 12, required: ["pasta", "canned tomatoes", "garlic", "olive oil"], optional: ["onion", "basil", "parmesan", "red pepper flakes"], instructions: ["Cook pasta", "Sauté onion and garlic", "Add tomatoes, simmer 10 min", "Toss with pasta, top with basil"], image: "https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg", isComplete: true },
    { name: "🍚 Coconut Curry Vegetables", calories: 420, prep: 30, protein: 8, required: ["coconut milk", "onion", "garlic", "curry powder"], optional: ["sweet potato", "carrot", "spinach", "chickpeas"], instructions: ["Sauté onion and garlic", "Add curry powder, cook 1 min", "Add coconut milk and vegetables", "Simmer 15-20 min", "Add spinach at the end"], image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg", isComplete: true }
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

// ========== RECIPE SEARCH ENDPOINT ==========
app.post('/api/search-recipes', async (req, res) => {
    try {
        const { ingredients, goal, mode } = req.body;
        if (!ingredients || ingredients.length === 0) {
            return res.json({ recipes: [] });
        }
        // Try Spoonacular if API key available
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
        // Fallback to local database
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
