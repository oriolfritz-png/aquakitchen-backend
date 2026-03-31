const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Enable CORS for all origins (so frontend can connect)
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Test endpoint
app.get('/', (req, res) => {
    res.json({ message: 'AquaKitchen API is running!' });
});

// Register endpoint (demo mode)
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, optInPromotions } = req.body;
        console.log('Registration attempt:', { firstName, lastName, email });
        // Demo mode - always success
        res.json({ success: true, message: 'Verification email sent! (Demo mode)' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify email endpoint (demo mode)
app.post('/api/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        console.log('Verification attempt with token:', token);
        // Demo mode - any token works
        if (token === '123456') {
            res.json({ 
                success: true, 
                token: 'demo-jwt-token-123', 
                user: { 
                    id: '1', 
                    firstName: 'Demo', 
                    lastName: 'User', 
                    email: 'demo@example.com', 
                    subscriptionTier: 'free' 
                }
            });
        } else {
            res.status(400).json({ error: 'Invalid or expired token' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Analyze images endpoint (demo mode)
app.post('/api/analyze-images', async (req, res) => {
    try {
        const { images } = req.body;
        console.log('Analyzing images:', Object.keys(images).filter(k => images[k]));
        
        // Demo ingredient detection based on zone
        const demoIngredients = {
            fridge: ['chicken breast', 'eggs', 'spinach', 'milk', 'cheese', 'butter', 'yogurt', 'carrots', 'broccoli'],
            pantry: ['rice', 'pasta', 'olive oil', 'salt', 'pepper', 'canned tomatoes', 'beans', 'flour', 'sugar'],
            freezer: ['frozen peas', 'frozen corn', 'frozen salmon', 'ice cream', 'frozen berries'],
            spices: ['paprika', 'cumin', 'garlic powder', 'oregano', 'basil', 'thyme', 'cinnamon']
        };
        
        const results = {};
        for (const [zone, imageBase64] of Object.entries(images)) {
            if (imageBase64) {
                results[zone] = demoIngredients[zone] || ['ingredients detected'];
            } else {
                results[zone] = [];
            }
        }
        
        res.json(results);
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search recipes endpoint (demo mode)
app.post('/api/search-recipes', async (req, res) => {
    try {
        const { ingredients } = req.body;
        console.log('Searching recipes for:', ingredients);
        
        const demoRecipes = [
            { 
                name: "🍗 Herb Roasted Chicken", 
                calories: 425, 
                prep: 45, 
                protein: 38, 
                isComplete: true,
                ingredients: ["chicken breast", "olive oil", "garlic", "rosemary"],
                instructions: ["Preheat oven to 425°F", "Season chicken with salt, pepper, and herbs", "Roast for 20-25 minutes until internal temperature reaches 165°F", "Let rest 5 minutes before serving"],
                image: "https://www.themealdb.com/images/media/meals/wyrqqq1468233628.jpg"
            },
            { 
                name: "🍤 Garlic Lemon Shrimp", 
                calories: 380, 
                prep: 25, 
                protein: 32, 
                isComplete: true,
                ingredients: ["shrimp", "garlic", "olive oil", "lemon", "parsley"],
                instructions: ["Heat olive oil in a large skillet", "Add shrimp and cook 1-2 minutes per side", "Add minced garlic and cook 30 seconds", "Add lemon juice and zest, toss to coat", "Garnish with parsley and serve"],
                image: "https://www.themealdb.com/images/media/meals/uxpqot1511553767.jpg"
            },
            { 
                name: "🥑 Creamy Avocado Pasta", 
                calories: 520, 
                prep: 20, 
                protein: 14, 
                isComplete: true,
                ingredients: ["pasta", "avocado", "garlic", "olive oil", "lemon", "basil"],
                instructions: ["Cook pasta according to package directions", "Reserve 1/2 cup pasta water", "Blend avocado, garlic, olive oil, and lemon juice until smooth", "Toss pasta with sauce, add pasta water as needed", "Top with fresh basil"],
                image: "https://www.themealdb.com/images/media/meals/uttuxy1511382180.jpg"
            }
        ];
        
        res.json({ recipes: demoRecipes });
    } catch (error) {
        console.error('Recipe search error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 AquaKitchen API running on port ${PORT}`);
    console.log(`Test: http://localhost:${PORT}`);
});