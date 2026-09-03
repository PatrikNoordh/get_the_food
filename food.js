const API_URL = "https://www.themealdb.com/api/json/v1/1/search.php?s=";

const MAX_INGREDIENTS = 20;

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const form = document.querySelector("#search-form");
const searchField = document.querySelector("#search-field");
const statusEl = document.querySelector("#status");
const results = document.querySelector("#results");
const aiToggle = document.querySelector("#ai-fallback");
const aiNote = document.querySelector("#ai-note");

const hasApiKey =
  typeof GEMINI_API_KEY !== "undefined" && GEMINI_API_KEY !== "";

if (!hasApiKey && aiToggle && aiNote) {
  aiToggle.checked = false;
  aiToggle.disabled = true;
  aiNote.textContent =
    "No API key found. Please add your API key in config.js.";
}

function getIngredients(meal) {
  const list = [];

  for (let i = 1; i <= MAX_INGREDIENTS; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];

    if (name?.trim()) {
      list.push(`${measure?.trim() ?? ""} ${name.trim()}`.trim());
    }
  }
  return list;
}

function createRecipeCard(meal) {
  const card = document.createElement("article");
  card.className = "recipe-card";

  const image = document.createElement("img");
  image.className = "recipe-image";
  image.src = meal.strMealThumb;
  image.alt = meal.strMeal;
  image.loading = "lazy";

  card.append(image);

  const title = document.createElement("h2");
  title.className = "recipe-title";
  title.textContent = meal.strMeal;
  card.append(title);

  const origin = document.createElement("p");
  origin.className = "recipe-origin";
  origin.textContent = meal.strArea || "Unknown origin";
  card.append(origin);

  const ingredients = document.createElement("ul");
  ingredients.className = "recipe-ingredients";

  for (const row of getIngredients(meal)) {
    const item = document.createElement("li");
    item.textContent = row;
    ingredients.append(item);
  }

  card.append(ingredients);

  const instructions = document.createElement("p");
  instructions.className = "recipe-instructions";
  instructions.textContent = meal.strInstructions;
  card.append(instructions);

  return card;
}

async function askGemini(query) {
  statusEl.textContent = "Asking AI for a recipe...";

  const prompt = `You are a helpful assistant that provides a recipe based on the following query: "${query}".
   Please provide a recipe with a title, list of ingredients, and step-by-step instructions.`;

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            area: { type: "STRING" },
            ingredients: { type: "ARRAY", items: { type: "STRING" } },
            instructions: { type: "STRING" },
          },
          required: ["title", "area", "ingredients", "instructions"],
        },
      },
    }),
  });

  if (!response.ok) {
    const messages = {
      400: "Bad request — check the request body.",
      403: "Invalid API key — check config.js.",
      429: "Too many requests — wait a moment and try again.",
      503: "The AI is overloaded right now. Try again in a few seconds.",
    };

    throw new Error(
      messages[response.status] ?? `Gemini responded ${response.status}`,
    );
  }
  const data = await response.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned an invalid JSON response.");
  }
}

function createAiRecipeCard(recipe) {
  const card = document.createElement("article");
  card.className = "Recipe-card ai-card";

  const badge = document.createElement("span");
  badge.className = "ai-badge";
  badge.textContent = "AI-generated";
  card.append(badge);

  const title = document.createElement("h2");
  title.className = "recipe-title";
  title.textContent = recipe.title;
  card.append(title);

  const origin = document.createElement("p");
  origin.className = "recipe-origin";
  origin.textContent = recipe.area || "Unknown origin";
  card.append(origin);

  const ingredients = document.createElement("ul");
  ingredients.className = "recipe-ingredients";

  for (const row of recipe.ingredients ?? []) {
    const item = document.createElement("li");
    item.textContent = row;
    ingredients.append(item);
  }

  card.append(ingredients);

  const instructions = document.createElement("p");
  instructions.className = "recipe-instructions";
  instructions.textContent = recipe.instructions;
  card.append(instructions);

  return card;
}

async function searchMeals(query) {
  results.replaceChildren();
  statusEl.textContent = "Searching...";

  try {
    const response = await fetch(API_URL + encodeURIComponent(query));

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.meals === null) {
      if (aiToggle?.checked) {
        const recipe = await askGemini(query);
        results.append(createAiRecipeCard(recipe));
        statusEl.textContent = `No match in TheMealDB — here is an AI suggestion for "${query}".`;
      } else {
        statusEl.textContent = `No results found for "${query}".`;
      }
      return;
    }

    statusEl.textContent = `${data.meals.length} recipes found.`;

    const fragment = document.createDocumentFragment();

    for (const meal of data.meals) {
      fragment.append(createRecipeCard(meal));
    }

    results.append(fragment);
  } catch (error) {
    statusEl.textContent = `An error occurred while searching for meals : ${error.message}.`;
    console.error("Error fetching meals:", error);
  }
}

if (form && searchField && statusEl && results) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const query = searchField.value.trim();

    if (!query) {
      statusEl.textContent = "Please enter a search term.";
      return;
    }

    searchMeals(query);
  });
}
