# Basket

A budget meal planner for UK supermarkets. Pick a supermarket, set a weekly budget, tick your appliances and say who's eating. Basket plans a week of dinners (plus breakfasts and lunches if you want them) and one shopping list, priced from that supermarket's real products, that fits the budget.

Also: favourite meals, your own items and regular items on the list, a price check across all five supermarkets, a spending tracker, and a Today screen with tonight's meal and prep reminders.

Supermarkets: Tesco, Asda, Aldi, Morrisons and Waitrose, with Clubcard, More Card and myWaitrose prices.

## Set it up (one time, about 10 minutes)

1. **Upload the files.** In your `basket` repo, tap **Add file → Upload files** and drag in everything from the Basket folder (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `README.md`, and the `data`, `icons` and `scripts` folders). Commit.
2. **Add the price workflow.** Folders starting with a dot often get skipped when you drag files, so add this one by hand: **Add file → Create new file**, name it `.github/workflows/update-prices.yml`, paste in the contents of that file, and commit.
3. **Check your secret.** Settings → Secrets and variables → Actions should show `APIFY_TOKEN`.
4. **Run the first price update.** Open the **Actions** tab. If GitHub asks, press the button to enable workflows. Choose **Update prices** on the left, then **Run workflow**. It takes about 5–15 minutes and costs about $2.50–$3.25 of your free Apify credit.
5. **Turn on the website.** Settings → Pages. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**, then Save. After a minute or two your app is at `https://YOUR-USERNAME.github.io/basket/`.
6. **Put it on your phone.** Open that link. On iPhone (Safari): Share → Add to Home Screen. On Android (Chrome): menu → Add to Home screen / Install app.

## How prices work

- The **Update prices** workflow runs once a month on its own (the 20th, early morning, just after the Apify credit resets) and whenever you press **Run workflow**.
- A full run searches 137 ingredients at 5 supermarkets, 5 products each, then keeps the best-value matches in `data/prices.json`. It costs about $2.50–$3.25 and is capped at $4, so the free $5 a month of Apify credit covers it.
- Tick **Only missing items** when you press Run workflow to fetch just the ingredients that don't have a real price yet. It's much cheaper and is handy after adding recipes.
- Check your credit reset date in Apify (Billing). If it isn't around the 18th–19th, change the day in `.github/workflows/update-prices.yml` to the day after it resets.
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
