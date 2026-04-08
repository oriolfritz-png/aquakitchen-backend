const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

app.use(cors({ origin: '*', credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

const UserSchema = new mongoose.Schema({
    firstName: String, lastName: String, email: { type: String, unique: true },
    password: String, emailVerified: { type: Boolean, default: true },
    subscriptionTier: { type: String, default: 'free' },
    optInPromotions: { type: Boolean, default: true },
    foodHabits: [{ ingredient: String, timestamp: Date, goal: String }],
    createdAt: Date, lastActive: Date
});
const User = mongoose.model('User', UserSchema);

// ========== COMPLETE EDIBLE FOODS DATABASE ==========
const EDIBLE_FOODS = new Set([
    'apple','banana','orange','lemon','lime','grape','strawberry','blueberry','raspberry',
    'cherry','peach','pear','plum','watermelon','cantaloupe','honeydew','mango','papaya','kiwi',
    'pineapple','coconut','avocado','tomato','olive','fig','date','pomegranate','cranberry',
    'carrot','broccoli','cauliflower','cabbage','lettuce','spinach','kale','arugula','celery',
    'cucumber','zucchini','eggplant','bell pepper','jalapeno','onion','garlic','shallot','leek',
    'potato','sweet potato','yam','radish','beet','turnip','parsnip','corn','pea','green bean',
    'asparagus','artichoke','mushroom','okra','rhubarb','squash','pumpkin',
    'chicken','beef','pork','lamb','veal','turkey','duck','fish','salmon','tuna','shrimp','crab',
    'lobster','scallop','clam','oyster','mussel','tofu','tempeh','seitan','egg','bacon','sausage',
    'ham','steak','ground beef','ground turkey','chicken breast','chicken thigh','pork chop',
    'milk','cheese','yogurt','butter','cream','sour cream','cream cheese','cottage cheese','parmesan',
    'cheddar','mozzarella','swiss','ricotta','feta','goat cheese','almond milk','soy milk','oat milk',
    'rice','pasta','noodle','bread','bagel','croissant','tortilla','cereal','oat','quinoa','barley',
    'farro','couscous','flour','cornmeal','polenta','spaghetti','macaroni','lasagna',
    'bean','lentil','chickpea','soybean','nut','almond','walnut','pecan','cashew','peanut',
    'sunflower seed','pumpkin seed','sesame seed','flaxseed','chia seed',
    'salt','pepper','paprika','cumin','coriander','turmeric','ginger','garlic powder','onion powder',
    'oregano','basil','thyme','rosemary','sage','parsley','cilantro','dill','mint','cinnamon',
    'nutmeg','clove','cardamom','vanilla','cocoa','chocolate','bay leaf','red pepper flakes','cayenne',
    'chili powder','curry powder','garam masala','five spice','herbes de provence',
    'soup','broth','stock','sauce','ketchup','mustard','mayonnaise','vinegar','oil','olive oil',
    'coconut oil','vegetable oil','honey','maple syrup','jam','jelly','peanut butter','nutella',
    'frozen peas','frozen corn','frozen broccoli','frozen spinach','french fry','ice cream','pizza',
    'coffee','tea','juice','soda','water','beer','wine'
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
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        const data = await response.json();
        const ingredients = new Set();
        if (data.responses && data.responses[0].labelAnnotations) {
            const labels = data.responses[0].labelAnnotations.map(l => l.description.toLowerCase());
            for (const label of labels) {
                if (EDIBLE_FOODS.has(label)) ingredients.add(label);
                else for (const food of EDIBLE_FOODS) if (label.includes(food)) { ingredients.add(food); break; }
            }
        }
        if (data.responses && data.responses[0].fullTextAnnotation) {
            const text = data.responses[0].fullTextAnnotation.text.toLowerCase();
            const words = text.split(/\s+/);
            for (const word of words) {
                if (EDIBLE_FOODS.has(word)) ingredients.add(word);
                else for (const food of EDIBLE_FOODS) if (word.includes(food) && food.length > 2) { ingredients.add(food); break; }
            }
        }
        return [...ingredients];
    } catch (error) {
        console.error('Vision API error:', error);
        return [];
    }
}

const SPOONACULAR_API_KEY = '8a6c06a6f98442bb98ab8807fd85718e';

async function searchSpoonacular(ingredients, category) {
    const ingredientString = ingredients.join(',');
    const url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(ingredientString)}&number=12&ranking=1&apiKey=${SPOONACULAR_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data || !data.length) return [];
        const recipes = [];
        for (const item of data) {
            const detailRes = await fetch(`https://api.spoonacular.com/recipes/${item.id}/information?apiKey=${SPOONACULAR_API_KEY}`);
            const detail = await detailRes.json();
            let recipeCategory = 'main course';
            const dishTypes = detail.dishTypes || [];
            if (dishTypes.includes('dessert') || dishTypes.includes('sweet')) recipeCategory = 'dessert';
            else if (dishTypes.includes('beverage') || dishTypes.includes('drink')) recipeCategory = 'drinks';
            else if (dishTypes.includes('side dish')) recipeCategory = 'side dish';
            if (category !== 'all' && recipeCategory !== category) continue;
            const fat = Math.round(detail.nutrition?.nutrients?.find(n => n.name === 'Fat')?.amount || 0);
            const fiber = Math.round(detail.nutrition?.nutrients?.find(n => n.name === 'Fiber')?.amount || 0);
            const protein = Math.round(detail.nutrition?.nutrients?.find(n => n.name === 'Protein')?.amount || 0);
            recipes.push({
                name: item.title,
                calories: Math.round(detail.nutrition?.nutrients?.find(n => n.name === 'Calories')?.amount || 400),
                prep: detail.readyInMinutes || 30,
                protein, fat, fiber,
                instructions: detail.instructions ? detail.instructions.split('. ').filter(s => s.length > 10) : ["Instructions not available"],
                isComplete: item.missedIngredientCount === 0,
                image: detail.image,
                missing_ingredients: item.missedIngredients.map(i => ({ name: i.name, amount: i.amount, unit: i.unit })),
                ingredients: detail.extendedIngredients ? detail.extendedIngredients.map(i => ({ name: i.name, amount: i.amount, unit: i.unit })) : [],
                category: recipeCategory
            });
        }
        return recipes;
    } catch (err) {
        console.error('Spoonacular error:', err);
        return [];
    }
}

const localRecipes = [
    { name: "🍗 Herb Roasted Chicken", calories: 425, prep: 45, protein: 38, fat: 18, fiber: 2, required: ["chicken"], optional: ["olive oil", "garlic", "onion", "carrot", "potato", "rosemary", "thyme"], category: "main course",
      instructions: ["Preheat oven to 425°F (220°C).", "Pat the chicken dry.", "Rub with 2 tbsp olive oil, 4 cloves minced garlic, 1 tbsp rosemary, 1 tbsp thyme.", "Season with salt and pepper.", "Place on roasting pan with chopped carrots, potatoes, onion.", "Roast 20-25 min per lb until internal temp 165°F (74°C).", "Rest 10 minutes before carving."],
      image: "https://www.themealdb.com/images/media/meals/wyrqqq1468233628.jpg",
      ingredients: [{ name: "chicken", amount: "1 whole (4-5 lbs)", unit: "" }, { name: "olive oil", amount: "2", unit: "tbsp" }, { name: "garlic", amount: "4", unit: "cloves" }, { name: "rosemary", amount: "1", unit: "tbsp" }, { name: "thyme", amount: "1", unit: "tbsp" }, { name: "salt", amount: "1", unit: "tsp" }, { name: "pepper", amount: "1/2", unit: "tsp" }] },
    { name: "🥓 Bacon & Egg Breakfast", calories: 450, prep: 15, protein: 24, fat: 32, fiber: 1, required: ["bacon", "egg"], optional: ["bread", "butter", "cheese"], category: "main course",
      instructions: ["Cook 4 slices bacon in skillet until crispy (5-7 min).", "Remove bacon, drain.", "Crack 2 eggs into the bacon fat, cook to liking.", "Toast 2 slices bread, butter them.", "Assemble: bacon on toast, top with eggs, add cheese if desired."],
      image: "https://www.themealdb.com/images/media/meals/ssrrqv1504384397.jpg",
      ingredients: [{ name: "bacon", amount: "4", unit: "slices" }, { name: "egg", amount: "2", unit: "large" }, { name: "bread", amount: "2", unit: "slices" }, { name: "butter", amount: "1", unit: "tbsp" }] },
    { name: "🍌 Banana Smoothie", calories: 200, prep: 5, protein: 5, fat: 1, fiber: 3, required: ["banana"], optional: ["milk", "yogurt", "honey"], category: "drinks",
      instructions: ["Peel 1 ripe banana, break into chunks.", "Add to blender with 1 cup milk (or yogurt).", "Blend until smooth.", "Add 1 tsp honey if desired, blend again.", "Pour into glass, serve immediately."],
      image: "https://www.themealdb.com/images/media/meals/uttuxy1511382180.jpg",
      ingredients: [{ name: "banana", amount: "1", unit: "ripe" }, { name: "milk", amount: "1", unit: "cup" }, { name: "honey", amount: "1", unit: "tsp" }] }
];

function findLocalRecipes(ingredients, mode, category, goal) {
    const ingredientSet = ingredients.map(i => i.toLowerCase());
    let results = [];
    for (const recipe of localRecipes) {
        if (category !== 'all' && recipe.category !== category) continue;
        const required = recipe.required.map(r => r.toLowerCase());
        const requiredCount = required.filter(req => ingredientSet.some(ing => ing.includes(req) || req.includes(ing))).length;
        if (mode === 'strict' && requiredCount < required.length) continue;
        if (mode === 'flexible' && requiredCount === 0) continue;
        let score = requiredCount;
        if (goal === 'glp1' && recipe.protein >= 25 && recipe.fat <= 15 && recipe.fiber >= 5) score += 5;
        results.push({ ...recipe, matchScore: score, missing_ingredients: required.filter(req => !ingredientSet.some(ing => ing.includes(req) || req.includes(ing))).map(req => ({ name: req, amount: "as needed", unit: "" })) });
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
        const user = new User({ firstName, lastName, email, password: hashed, emailVerified: true, optInPromotions: optInPromotions !== false, createdAt: new Date() });
        await user.save();
        const token = jwt.sign({ userId: user._id, email: user.email, tier: user.subscriptionTier }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, firstName, lastName, email, subscriptionTier: user.subscriptionTier } });
    } catch (error) { res.status(500).json({ error: error.message }); }
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
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/update-tier', async (req, res) => {
    try {
        const { userId, tier } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.subscriptionTier = tier;
        await user.save();
        res.json({ success: true, user: { id: user._id, subscriptionTier: user.subscriptionTier } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/analyze-images', async (req, res) => {
    try {
        const { images } = req.body;
        const results = {};
        for (const [zone, imageBase64] of Object.entries(images)) {
            if (imageBase64) results[zone] = await analyzeWithGoogleVision(imageBase64);
            else results[zone] = [];
        }
        res.json(results);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/search-recipes', async (req, res) => {
    try {
        const { ingredients, goal, mode, category } = req.body;
        if (!ingredients || ingredients.length === 0) return res.json({ recipes: [] });
        let recipes = await searchSpoonacular(ingredients, category || 'all');
        if (recipes.length) {
            if (goal === 'glp1') {
                recipes = recipes.filter(r => (r.protein || 0) >= 25 && (r.fat || 0) <= 15 && (r.fiber || 0) >= 5);
            }
            res.json({ recipes });
        } else {
            const local = findLocalRecipes(ingredients, mode || 'flexible', category || 'all', goal);
            res.json({ recipes: local });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ========== GEMINI AI CHEF – USING gemini-1.5-flash-latest ==========
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function callGemini(prompt) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error("Missing GEMINI_API_KEY in Environment Variables");
            return null;
        }

        // Changed model name to gemini-1.5-flash-latest
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (err) {
        console.error('Gemini API Error details:', err.message);
        return null;
    }
}

function localAIResponse(question, ingredients, goal) {
    const q = question.toLowerCase();
    if (q.includes('what can i make') || q.includes('recipe')) {
        if (ingredients.length === 0) return "You haven't added any ingredients yet. Upload a photo or manually add ingredients first!";
        const top3 = ingredients.slice(0, 3).join(', ');
        return `With ${top3}${ingredients.length > 3 ? ' and others' : ''}, you could make a stir-fry, soup, omelette, or salad. Click 'Search Web for Recipes' above to see specific recipes!`;
    }
    if (q.includes('healthy') || goal === 'glp1') {
        return "For a GLP‑1 friendly meal, focus on lean protein (chicken, fish, tofu), non-starchy vegetables, and healthy fats like avocado. Avoid fried foods, sugary drinks, and heavy sauces.";
    }
    if (q.includes('substitute') || q.includes('instead of')) {
        return "Common substitutions: Greek yogurt for sour cream, applesauce for oil in baking, cauliflower for rice, zucchini for pasta. Tell me what ingredient you want to replace!";
    }
    return "I'm your AI chef! Ask me about recipes, substitutions, cooking times, or healthy meal ideas based on your ingredients.";
}

app.post('/api/ai-ask', async (req, res) => {
    try {
        const { question, ingredients, goal } = req.body;
        if (!question) return res.status(400).json({ error: 'No question provided' });
        const prompt = `You are a helpful AI chef. The user has ingredients: ${ingredients?.join(', ') || 'none'}. Their diet goal: ${goal || 'none'}. Answer: ${question}. Keep answer short and practical (max 150 words).`;
        let answer = await callGemini(prompt);
        if (!answer) {
            answer = localAIResponse(question, ingredients, goal);
        }
        res.json({ answer });
    } catch (error) {
        console.error('Gemini error:', error);
        const fallback = localAIResponse(req.body.question, req.body.ingredients, req.body.goal);
        res.json({ answer: fallback });
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
