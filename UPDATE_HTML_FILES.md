# Quick Guide: Update Remaining HTML Files

## Files to Update (10 files):
- ✅ index.html (DONE)
- ✅ about.html (DONE)
- ✅ login.html (DONE)
- ✅ members.html (DONE)
- ⬜ downloads.html
- ⬜ jennie.html
- ⬜ kim.html
- ⬜ lisa.html
- ⬜ membership_card.html
- ⬜ news.html
- ⬜ projects.html
- ⬜ rose.html
- ⬜ shop.html
- ⬜ streaming_guidelines.html

---

## For Each File, Make 2 Changes:

### Change 1: Replace Search Bar with Auth Button

**Find this (around line 52-60 in navbar):**
```html
          <li class="nav-item">
            <a class="nav-link" href="about.html">About &nbsp;</a>
          </li>
          <li class="nav-item">
            <form class="d-flex">
              <input class="form-control me-2" type="search" placeholder="Search" aria-label="Search">
              <button class="btn-danger btn" type="submit">Search</button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  </nav>
```

**Replace with:**
```html
          <li class="nav-item">
            <a class="nav-link" href="about.html">About &nbsp;</a>
          </li>
          <li class="nav-item">
            <a id="authButton" class="nav-link btn btn-danger" href="login.html">Login</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>
```

---

### Change 2: Add Firebase Scripts Before `</body>`

**Find this (at the end of the file):**
```html
</body>

</html>
```

**Replace with:**
```html
  <!-- Firebase SDK -->
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>

  <!-- Configuration and Auth Scripts -->
  <script src=".env.js"></script>
  <script src="js/config.js"></script>
  <script src="js/auth.js"></script>
  <script src="js/support.js"></script>

</body>

</html>
```

---

## Using Find & Replace in Your Editor:

### For VS Code / Text Editor:
1. Open the HTML file
2. Press `Ctrl+H` (Find and Replace)

#### First Replace:
- **Find:** (enable regex)
```regex
(<li class="nav-item">\s*<form class="d-flex">[\s\S]*?</form>\s*</li>)
```
- **Replace:**
```html
<li class="nav-item">
            <a id="authButton" class="nav-link btn btn-danger" href="login.html">Login</a>
          </li>
```

#### Second Replace:
- **Find:**
```
</body>

</html>
```
- **Replace:**
```html
  <!-- Firebase SDK -->
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>

  <!-- Configuration and Auth Scripts -->
  <script src=".env.js"></script>
  <script src="js/config.js"></script>
  <script src="js/auth.js"></script>
  <script src="js/support.js"></script>

</body>

</html>
```

---

## After Updating All Files:

1. ✅ Verify the auth button appears on all pages
2. ✅ Test clicking the button redirects to login.html
3. ✅ After logging in, verify the button changes to "Members"
4. ✅ Test clicking "Members" button goes to members.html

---

## Quick Test Checklist:

```bash
# Navigate to each page while logged OUT:
- downloads.html → Should see "Login" button
- news.html → Should see "Login" button
- projects.html → Should see "Login" button
- shop.html → Should see "Login" button
- jennie.html → Should see "Login" button
- kim.html → Should see "Login" button
- lisa.html → Should see "Login" button
- rose.html → Should see "Login" button
- membership_card.html → Should see "Login" button
- streaming_guidelines.html → Should see "Login" button

# Log in, then navigate to each page:
- All pages → Should now see "Members" button instead
```

---

**Estimated Time:** 15-20 minutes for all 10 files
