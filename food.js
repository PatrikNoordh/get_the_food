/**
 * Recipe search against two APIs.
 *
 * TheMealDB is the primary source: a public GET endpoint, no auth.
 * When it returns no match and the user has opted in, the query is
 * forwarded to Google Gemini, which generates a recipe instead.
 *
 * The two calls are deliberately different in shape (GET vs POST,
 * flat vs deeply nested response) — see askGemini() for the contrast.
 *
 * Requires config.js to define GEMINI_API_KEY. See config.example.js.
 */


const API_URL = "https://www.themealdb.com/api/json/v1/1/search.php?s=";

// TheMealDB always exposes 20 ingredient slots regardless of recipe size.
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

/**
 * Flattens TheMealDB's 20 ingredient/measure field pairs into a list.
 *
 * Empty slots arrive inconsistently as "", " " or null, so each field
 * is trimmed and falsy values are skipped.
 *
 * @param {object} meal - A meal object from TheMealDB
 * @returns {string[]} Formatted lines, e.g. "200 g flour"
 */
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


/**
 * Builds a recipe card element.
 *
 * Uses createElement/textContent rather than innerHTML: the content
 * comes from an external API and must never be parsed as HTML (XSS).
 *
 * Returns the element rather than inserting it, so the caller controls
 * placement — several cards are batched into a fragment before insert.
 *
 * @param {object} meal - A meal object from TheMealDB
 * @returns {HTMLElement} An <article> ready to insert
 */
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

/**
 * Asks Gemini for a recipe and returns it as a structured object.
 *
 * Unlike the TheMealDB call this is a POST with a JSON body and a
 * Content-Type header, and the payload is nested several levels deep.
 *
 * @param {string} query - The user's original search term
 * @returns {Promise<object>} Parsed recipe: title, area, ingredients, instructions
 * @throws {Error} With a user-facing message on HTTP or parsing failure
 */
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

  // fetch only rejects on network failure. HTTP error statuses are
    // successful requests as far as it is concerned, so they must be
    // checked explicitly or a 503 body gets parsed as a recipe.
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

    // The reply is a string that itself contains JSON, so it needs a
    // second parse on top of response.json(). Optional chaining guards
    // the path: the model can return a candidate with no content when
    // a response is blocked.
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


/**
 * Builds a card for an AI-generated recipe.
 *
 * Mirrors createRecipeCard, with two differences: no image (Gemini
 * returns none) and a badge marking the content as unverified.
 *
 * The element carries both classes — .recipe-card holds the shared
 * styling, .ai-card only the differences.
 *
 * @param {{title: string, area: string, ingredients: string[], instructions: string}} recipe
 * @returns {HTMLElement} An <article> ready to insert
 */
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

    // TheMealDB returns null rather than [] when nothing matches, so
    // this must be checked before touching .length. Zero results is
    // also where the AI fallback hooks in, when the user opted in.
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
