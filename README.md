# Basket

A budget meal planner for UK supermarkets. Pick a supermarket, set a weekly budget, tick your appliances and say who's eating. Basket plans seven dinners and one shopping list, priced from that supermarket's real products, that fits the budget.

Supermarkets: Tesco, Asda, Aldi, Morrisons and Waitrose, with Clubcard, More Card and myWaitrose prices.

## Set it up (one time, about 10 minutes)

1. **Upload the files.** In your `basket` repo, tap **Add file → Upload files** and drag in everything from the Basket folder (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `README.md`, and the `data`, `icons` and `scripts` folders). Commit.
2. **Add the price workflow.** Folders starting with a dot often get skipped when you drag files, so add this one by hand: **Add file → Create new file**, name it `.github/workflows/update-prices.yml`, paste in the contents of that file, and commit.
3. **Check your secret.** Settings → Secrets and variables → Actions should show `APIFY_TOKEN`.
4. **Run the first price update.** Open the **Actions** tab. If GitHub asks, press the button to enable workflows. Choose **Update prices** on the left, then **Run workflow**. It takes about 5–15 minutes and costs about $2.10 of your free Apify credit.
5. **Turn on the website.** Settings → Pages. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**, then Save. After a minute or two your app is at `https://YOUR-USERNAME.github.io/basket/`.
6. **Put it on your phone.** Open that link. On iPhone (Safari): Share → Add to Home Screen. On Android (Chrome): menu → Add to Home screen / Install app.

## How prices work

- The **Update prices** workflow runs once a month on its own (the 1st, early morning) and whenever you press **Run workflow**.
- Each run searches 85 ingredients at 5 supermarkets, 5 products each, then keeps the best-value matches in `data/prices.json`. Spend is capped at $2.50 a run, so the free $5 a month of Apify credit covers it with room for one extra run.
- If a supermarket blocks the search one month, Basket keeps that supermarket's last good prices.
- Until the first run finishes, the app shows sample prices and says so.
- Prices are the standard online price for each supermarket. Your local store may differ a little. Aldi's are its "in-store" prices, as Aldi doesn't do online grocery delivery.

## Changing meals and ingredients

- Recipes live in `data/recipes.json`. Each one lists ingredients per portion, the appliances it needs and the steps.
- Ingredients live in `data/ingredients.json`. Each has the search term sent to the supermarkets, plus words a product name must include or must not include.
- A new ingredient gets priced on the next price update.

## Good to know

- Saved weeks, settings and ticks are stored on the device you use. A family login can be added later; the storage code is kept in one place in `app.js` for that.
- Scraping supermarket sites is against their terms of use. For a free family app the practical risk is low, but it is a risk, and the scraper is a new community tool that could stop working.
