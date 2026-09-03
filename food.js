const API_URL = "https://www.themealdb.com/api/json/v1/1/search.php?s=";

const MAX_INGREDIENTS = 20;

const form = document.querySelector("#search-form");
const searchField = document.querySelector("#search-field");
const statusEl = document.querySelector("#status");
const results = document.querySelector("#results");

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
      statusEl.textContent = `No results found for "${query}".`;
      return;
    }

    statusEl.textContent = `${data.meals.length} recipes found.`;

    const fragment = document.createDocumentFragment();

    for (const meal of data.meals) {
      fragment.append(createRecipeCard(meal));
    }

    results.append(fragment);
  } catch (error) {
    statusEl.textContent =
      `An error occurred while searching for meals : ${error.message}.`;
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
