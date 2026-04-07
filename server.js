const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch'); // ✅ REQUIRED FOR RENDER
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

// ========== GOOGLE VISION (FIXED ONLY) ==========
async function analyzeWithGoogleVision(imageBase64) {
    try {
        if (!imageBase64) return [];

        const apiKey = process.env.GOOGLE_VISION_API_KEY;
        const base64Image = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { content: base64Image },
                    features: [
                        { type: 'LABEL_DETECTION', maxResults: 30 },
                        { type: 'TEXT_DETECTION', maxResults: 20 }
                    ]
                }]
            })
        });

        if (!response.ok) {
            console.error("Vision HTTP error:", response.status);
            return [];
        }

        const data = await response.json();

        const ingredients = new Set();

        const labels = data?.responses?.[0]?.labelAnnotations || [];
        const textData = data?.responses?.[0]?.fullTextAnnotation?.text || "";

        // LABEL MATCHING
        for (const l of labels) {
            const label = (l.description || '').toLowerCase();
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

        // TEXT MATCHING
        const words = textData.toLowerCase().split(/\s+/);
        for (const word of words) {
            if (EDIBLE_FOODS.has(word)) ingredients.add(word);
            else {
                for (const food of EDIBLE_FOODS) {
                    if (word.includes(food) && food.length > 2) {
                        ingredients.add(food);
                        break;
                    }
                }
            }
        }

        return [...ingredients];

    } catch (error) {
        console.error('Vision API error:', error?.message || error);
        return [];
    }
}

// ========== GEMINI (FIXED ONLY) ==========
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function callGemini(prompt) {
    const modelNames = ['gemini-1.5-flash', 'gemini-1.5-pro'];

    for (const modelName of modelNames) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent(prompt);

            if (!result || !result.response) continue;

            const text = result.response.text();

            if (text) return text;

        } catch (err) {
            console.log(`Model ${modelName} failed:`, err?.message || err);
        }
    }

    return null;
}
