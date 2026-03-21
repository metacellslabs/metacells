# Featured Issues → README Automation

This workflow automatically adds **featured issues** to the repository `README.md`.

It scans open issues with the label `featured` and a category label (such as `ui/ux`, `tests`, `core`, `channels`, etc.), groups them, and inserts them into the README.

The list updates automatically when:
- code is pushed to `main`
- an issue is created or edited
- labels are added or removed
- an issue is closed or reopened

Closed issues are automatically removed from the list.

---

# How It Works

The workflow:

1. Fetches all **open issues**
2. Filters issues that have the label **`featured`**
3. Uses the second label as the **category**
4. Groups issues by category
5. Updates a block inside `README.md`

---

# Preparing the README

Add this section to your `README.md`:

```md
## Hot fixes wanted!

<!-- featured-issues:start -->
<!-- featured-issues:end -->