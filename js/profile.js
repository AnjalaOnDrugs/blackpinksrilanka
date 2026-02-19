/**
 * Profile Page Logic
 * Handles loading user data, inline editing, avatar upload, and Google Sheets integration.
 * Uses shared compressProfileImage from auth.js for avatar uploads (10MB limit).
 * Reads bias from column J and BLINK since from column H.
 * Image-based bias picker writes changes back to Google Sheet.
 */

// ========== STATE ==========
let profileData = null;
let phoneNumber = '';

// ========== TOAST HELPER ==========
function showToast(message, type) {
    var toast = document.getElementById('profileToast');
    toast.textContent = message;
    toast.className = 'profile-toast profile-toast--' + (type || 'info');
    // Trigger reflow for re-animation
    void toast.offsetWidth;
    toast.classList.add('visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function () {
        toast.classList.remove('visible');
    }, 3500);
}

// ========== BIAS DISPLAY HELPERS ==========
var biasClass = {
    'Jisoo': 'bias-jisoo',
    'Jennie': 'bias-jennie',
    'Rosé': 'bias-rose',
    'Rose': 'bias-rose',
    'Lisa': 'bias-lisa',
    'OT4': 'bias-ot4'
};

function formatBias(bias) {
    if (!bias) return null;
    return bias;
}

// ========== MASK PHONE NUMBER ==========
function maskPhone(phone) {
    if (!phone) return '—';
    // Show first 3 and last 2 digits, mask the rest
    if (phone.length <= 5) return phone;
    return phone.substring(0, 3) + '****' + phone.substring(phone.length - 2);
}

// ========== FORMAT DATE ==========
function formatDate(timestamp) {
    if (!timestamp) return null;
    var d = new Date(timestamp);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

// ========== FETCH MEMBER DATA FROM GOOGLE SHEET ==========
async function fetchSheetMemberData(phone) {
    try {
        var response = await fetch(CONFIG.googleSheetsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'getMemberData',
                phone: phone
            })
        });
        var data = await response.json();
        if (data.status === 'success' && data.found) {
            return {
                bias: data.bias || null,
                blinkSince: data.blinkSince || null
            };
        }
    } catch (err) {
        console.warn('[Profile] Could not fetch sheet data:', err);
    }
    return null;
}

// ========== UPDATE BIAS IN GOOGLE SHEET ==========
async function updateBiasInSheet(phone, bias) {
    try {
        await fetch(CONFIG.googleSheetsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'updateBias',
                phone: phone,
                bias: bias
            })
        });
        console.log('[Profile] Bias updated in Google Sheet');
    } catch (err) {
        console.warn('[Profile] Could not update bias in sheet:', err);
    }
}

// ========== DISTRICT COOLDOWN CHECK ==========
function checkDistrictCooldown(districtLastChanged) {
    if (!districtLastChanged) return { canEdit: true };
    var thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    var timeSinceChange = Date.now() - districtLastChanged;
    if (timeSinceChange < thirtyDaysMs) {
        var nextDate = new Date(districtLastChanged + thirtyDaysMs);
        return {
            canEdit: false,
            nextChangeDate: nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        };
    }
    return { canEdit: true };
}

// ========== INLINE EDIT HELPERS ==========
function setupInlineEdit(options) {
    var editBtn = document.getElementById(options.editBtnId);
    var valueEl = document.getElementById(options.valueId);
    var editSection = document.getElementById(options.editSectionId);
    var saveBtn = document.getElementById(options.saveBtnId);
    var cancelBtn = document.getElementById(options.cancelBtnId);
    var inputEl = document.getElementById(options.inputId);

    if (!editBtn || !valueEl || !editSection || !saveBtn || !cancelBtn || !inputEl) return;

    // Check if edit is allowed
    if (options.disabled) {
        editBtn.disabled = true;
        return;
    }

    function openEdit() {
        var currentVal = options.getCurrentValue();
        if (inputEl.tagName === 'SELECT') {
            inputEl.value = currentVal || '';
        } else {
            inputEl.value = currentVal || '';
        }
        valueEl.classList.add('editing');
        editSection.classList.add('active');
        editBtn.style.display = 'none';
        inputEl.focus();
    }

    function closeEdit() {
        valueEl.classList.remove('editing');
        editSection.classList.remove('active');
        editBtn.style.display = '';
    }

    editBtn.addEventListener('click', openEdit);
    cancelBtn.addEventListener('click', closeEdit);

    // Save handler
    saveBtn.addEventListener('click', async function () {
        var newValue = inputEl.value.trim();
        if (!newValue) {
            showToast('Please enter a value', 'error');
            return;
        }

        saveBtn.disabled = true;
        try {
            await options.onSave(newValue);
            closeEdit();
        } catch (err) {
            showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error');
        }
        saveBtn.disabled = false;
    });

    // Enter key to save (for text inputs)
    if (inputEl.tagName === 'INPUT') {
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveBtn.click();
            }
            if (e.key === 'Escape') {
                closeEdit();
            }
        });
    }
}

// ========== POPULATE DISTRICT DROPDOWN ==========
function populateProfileDistrictDropdown() {
    var sel = document.getElementById('districtSelect');
    if (!sel) return;
    SL_DISTRICTS.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        sel.appendChild(opt);
    });
}

// ========== AVATAR UPLOAD (10MB limit + compression) ==========
function setupAvatarUpload() {
    var input = document.getElementById('avatarInput');
    var avatarEl = document.getElementById('profileAvatar');

    if (!input || !avatarEl) return;

    input.addEventListener('change', async function () {
        var file = this.files[0];
        if (!file) return;

        // Use shared validation (10MB limit)
        var validation = validateProfileImageFile(file);
        if (!validation.valid) {
            showToast(validation.message, 'error');
            return;
        }

        try {
            // Compress using shared function from auth.js
            var dataUrl = await compressProfileImage(file);

            // Show preview immediately
            renderAvatar(dataUrl);

            // Save to Convex
            await ConvexService.mutation('users:updateProfilePicture', {
                phoneNumber: phoneNumber,
                profilePicture: dataUrl
            });

            showToast('Profile picture updated!', 'success');
        } catch (err) {
            console.error('Avatar upload error:', err);
            showToast('Failed to upload picture', 'error');
        }
    });
}

function renderAvatar(profilePicture) {
    var avatarEl = document.getElementById('profileAvatar');
    var initialEl = document.getElementById('profileAvatarInitial');

    if (profilePicture) {
        initialEl.style.display = 'none';
        // Check if img already exists
        var existing = avatarEl.querySelector('img');
        if (existing) {
            existing.src = profilePicture;
        } else {
            var img = document.createElement('img');
            img.src = profilePicture;
            img.alt = 'Profile';
            avatarEl.appendChild(img);
        }
    } else {
        initialEl.style.display = '';
        var existImg = avatarEl.querySelector('img');
        if (existImg) existImg.remove();
    }
}

// ========== BIAS IMAGE PICKER ==========
function setupBiasPicker() {
    var overlay = document.getElementById('biasPickerOverlay');
    var closeBtn = document.getElementById('biasPickerClose');
    var editBtn = document.getElementById('biasEditBtn');
    var cards = overlay ? overlay.querySelectorAll('.bias-picker-card') : [];

    if (!overlay || !closeBtn || !editBtn || cards.length === 0) return;

    editBtn.addEventListener('click', function () {
        // Highlight current bias
        cards.forEach(function (card) {
            card.classList.remove('selected');
            if (profileData && profileData.bias && card.dataset.bias === profileData.bias) {
                card.classList.add('selected');
            }
        });
        overlay.classList.add('active');
    });

    closeBtn.addEventListener('click', function () {
        overlay.classList.remove('active');
    });

    // Close on overlay click
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });

    cards.forEach(function (card) {
        card.addEventListener('click', async function () {
            var newBias = this.dataset.bias;
            overlay.classList.remove('active');

            // Show loading immediately
            var biasVal = document.getElementById('biasValue');
            biasVal.textContent = 'Saving...';
            biasVal.className = 'profile-row-value';

            try {
                // Update Convex
                await ConvexService.mutation('users:updateBias', {
                    phoneNumber: phoneNumber,
                    bias: newBias
                });

                // Update Google Sheet (fire and forget)
                updateBiasInSheet(phoneNumber, newBias);

                // Update local state
                profileData.bias = newBias;

                // Update UI
                biasVal.textContent = formatBias(newBias);
                biasVal.className = 'profile-row-value ' + (biasClass[newBias] || '');

                showToast('Bias updated!', 'success');
            } catch (err) {
                console.error('[Profile] Bias update error:', err);
                // Restore previous value
                if (profileData.bias) {
                    biasVal.textContent = formatBias(profileData.bias);
                    biasVal.className = 'profile-row-value ' + (biasClass[profileData.bias] || '');
                } else {
                    biasVal.textContent = 'Not set';
                    biasVal.className = 'profile-row-value profile-row-value--muted';
                }
                showToast('Failed to update bias', 'error');
            }
        });
    });
}

// ========== PFP UPLOAD DIALOG (from profile page) ==========
function setupProfilePfpDialog() {
    var overlay = document.getElementById('pfpUploadOverlay');
    if (!overlay) return;

    var fileInput = document.getElementById('pfpFileInput');
    var previewWrap = document.getElementById('pfpUploadPreview');
    var previewImg = document.getElementById('pfpPreviewImg');
    var saveBtn = document.getElementById('pfpSaveBtn');
    var skipBtn = document.getElementById('pfpSkipBtn');
    var uploadBtn = document.getElementById('pfpUploadBtn');

    // The avatar area can also trigger this dialog
    var avatarEl = document.getElementById('profileAvatar');
    if (avatarEl) {
        avatarEl.addEventListener('dblclick', function () {
            overlay.classList.add('active');
        });
    }

    var pendingDataUrl = null;

    fileInput.addEventListener('change', async function () {
        var file = this.files[0];
        if (!file) return;

        var validation = validateProfileImageFile(file);
        if (!validation.valid) {
            showToast(validation.message, 'error');
            return;
        }

        uploadBtn.innerHTML = '<span class="auth-loading"></span>Compressing...';
        uploadBtn.style.pointerEvents = 'none';

        try {
            var dataUrl = await compressProfileImage(file);
            pendingDataUrl = dataUrl;

            previewImg.src = dataUrl;
            previewWrap.style.display = '';
            saveBtn.style.display = '';
            uploadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Change Photo';
            uploadBtn.style.pointerEvents = '';
        } catch (err) {
            console.error('[PFP] Compression error:', err);
            showToast('Failed to process image. Try a different photo.', 'error');
            uploadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Choose Photo';
            uploadBtn.style.pointerEvents = '';
        }
    });

    saveBtn.addEventListener('click', async function () {
        if (!pendingDataUrl) return;

        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        try {
            await ConvexService.mutation('users:updateProfilePicture', {
                phoneNumber: phoneNumber,
                profilePicture: pendingDataUrl
            });

            renderAvatar(pendingDataUrl);
            overlay.classList.remove('active');
            showToast('Profile picture updated!', 'success');

            // Reset dialog state
            pendingDataUrl = null;
            previewWrap.style.display = 'none';
            saveBtn.style.display = 'none';
            saveBtn.textContent = 'Save Profile Picture';
            saveBtn.disabled = false;
        } catch (err) {
            console.error('[PFP] Save error:', err);
            showToast('Failed to save profile picture', 'error');
            saveBtn.textContent = 'Save Profile Picture';
            saveBtn.disabled = false;
        }
    });

    skipBtn.addEventListener('click', function () {
        overlay.classList.remove('active');
        pendingDataUrl = null;
        previewWrap.style.display = 'none';
        saveBtn.style.display = 'none';
    });
}

// ========== MAIN INITIALIZATION ==========
checkAuthState().then(async function (user) {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        profileData = await getCurrentUserData();
        if (!profileData) {
            showToast('Could not load profile', 'error');
            return;
        }

        phoneNumber = profileData.phoneNumber;

        // Populate page
        populateProfilePage(profileData);

        // Populate district dropdown
        populateProfileDistrictDropdown();

        // Fetch additional data from Google Sheet (bias & BLINK since)
        fetchSheetDataAndFill(phoneNumber);

        // Setup avatar upload
        setupAvatarUpload();

        // Setup inline editors
        setupEditors(profileData);

        // Setup bias image picker
        setupBiasPicker();

        // Setup PFP upload dialog
        setupProfilePfpDialog();

        // Show content, hide loading
        document.getElementById('profileLoading').style.display = 'none';
        document.getElementById('profileContent').style.display = '';

    } catch (err) {
        console.error('[Profile] Init error:', err);
        showToast('Error loading profile', 'error');
    }
});

// ========== POPULATE PAGE ==========
function populateProfilePage(data) {
    // Avatar
    if (data.profilePicture) {
        renderAvatar(data.profilePicture);
    } else {
        document.getElementById('profileAvatarInitial').textContent =
            data.username ? data.username.charAt(0).toUpperCase() : '?';
    }

    // Display name
    document.getElementById('profileDisplayName').textContent = data.username || 'BLINK';

    // Phone
    document.getElementById('phoneValue').textContent = maskPhone(data.phoneNumber);

    // Username
    document.getElementById('usernameValue').textContent = data.username || '—';

    // Last.fm
    var lastfmVal = document.getElementById('lastfmValue');
    if (data.lastfmUsername) {
        lastfmVal.textContent = data.lastfmUsername;
        lastfmVal.classList.remove('profile-row-value--muted');
    } else {
        lastfmVal.textContent = 'Not connected';
        lastfmVal.classList.add('profile-row-value--muted');
    }

    // Bias
    var biasVal = document.getElementById('biasValue');
    if (data.bias) {
        biasVal.textContent = formatBias(data.bias);
        biasVal.className = 'profile-row-value ' + (biasClass[data.bias] || '');
    } else {
        biasVal.textContent = 'Not set';
        biasVal.classList.add('profile-row-value--muted');
    }

    // District
    var districtVal = document.getElementById('districtValue');
    if (data.district) {
        districtVal.textContent = data.district;
        districtVal.classList.remove('profile-row-value--muted');
    } else {
        districtVal.textContent = 'Not set';
        districtVal.classList.add('profile-row-value--muted');
    }

    // District cooldown
    var cooldownStatus = checkDistrictCooldown(data.districtLastChanged);
    if (!cooldownStatus.canEdit) {
        var cooldownEl = document.getElementById('districtCooldown');
        document.getElementById('districtCooldownText').textContent =
            'Can change after ' + cooldownStatus.nextChangeDate;
        cooldownEl.style.display = '';
    }

    // BLINK since in header (from Convex registeredAt fallback)
    var blinkText = document.getElementById('blinkSinceText');
    if (data.registeredAt) {
        blinkText.textContent = 'Registered user since ' + formatDate(data.registeredAt);
    } else {
        blinkText.textContent = 'BLINK';
    }
}

// ========== FETCH SHEET DATA ==========
async function fetchSheetDataAndFill(phone) {
    var sheetData = await fetchSheetMemberData(phone);
    if (!sheetData) return;

    // BLINK since date from sheet (column H)
    var blinkSinceVal = document.getElementById('blinkSinceValue');
    if (sheetData.blinkSince) {
        blinkSinceVal.textContent = sheetData.blinkSince;
        blinkSinceVal.classList.remove('profile-row-value--muted');
        document.getElementById('sheetBadge').style.display = '';

        // Also update header
        var blinkText = document.getElementById('blinkSinceText');
        blinkText.textContent = 'BPSL Member since ' + sheetData.blinkSince;
    } else {
        blinkSinceVal.innerHTML = '<span class="profile-row-value--muted">Not available</span>';
    }

    // If bias is from sheet and user hasn't set one in Convex yet, display it
    if (sheetData.bias && !profileData.bias) {
        var biasVal = document.getElementById('biasValue');
        biasVal.textContent = formatBias(sheetData.bias);
        biasVal.className = 'profile-row-value ' + (biasClass[sheetData.bias] || '');
        // Also save it to Convex so it persists
        try {
            await ConvexService.mutation('users:updateBias', {
                phoneNumber: phoneNumber,
                bias: sheetData.bias
            });
            profileData.bias = sheetData.bias;
        } catch (e) {
            console.warn('[Profile] Could not persist sheet bias:', e);
        }
    }
}

// ========== SETUP EDITORS ==========
function setupEditors(data) {
    // Username editor
    setupInlineEdit({
        editBtnId: 'usernameEditBtn',
        valueId: 'usernameValue',
        editSectionId: 'usernameEdit',
        saveBtnId: 'usernameSave',
        cancelBtnId: 'usernameCancel',
        inputId: 'usernameInput',
        getCurrentValue: function () { return data.username; },
        onSave: async function (newValue) {
            if (newValue.length < 3) {
                showToast('Username must be at least 3 characters', 'error');
                throw new Error('Too short');
            }
            if (newValue.length > 24) {
                showToast('Username must be at most 24 characters', 'error');
                throw new Error('Too long');
            }
            var result = await ConvexService.mutation('users:updateUsername', {
                phoneNumber: phoneNumber,
                username: newValue
            });
            if (result && !result.success) {
                showToast(result.message, 'error');
                throw new Error(result.message);
            }
            data.username = newValue;
            document.getElementById('usernameValue').textContent = newValue;
            document.getElementById('profileDisplayName').textContent = newValue;
            document.getElementById('profileAvatarInitial').textContent = newValue.charAt(0).toUpperCase();
            showToast('Username updated!', 'success');
        }
    });

    // Last.fm editor
    setupInlineEdit({
        editBtnId: 'lastfmEditBtn',
        valueId: 'lastfmValue',
        editSectionId: 'lastfmEdit',
        saveBtnId: 'lastfmSave',
        cancelBtnId: 'lastfmCancel',
        inputId: 'lastfmInput',
        getCurrentValue: function () { return data.lastfmUsername; },
        onSave: async function (newValue) {
            await ConvexService.mutation('users:updateLastfmUsername', {
                phoneNumber: phoneNumber,
                lastfmUsername: newValue
            });
            data.lastfmUsername = newValue;
            var lastfmVal = document.getElementById('lastfmValue');
            lastfmVal.textContent = newValue;
            lastfmVal.classList.remove('profile-row-value--muted');
            showToast('Last.fm username updated!', 'success');
        }
    });

    // District editor (with monthly restriction)
    var cooldownStatus = checkDistrictCooldown(data.districtLastChanged);
    setupInlineEdit({
        editBtnId: 'districtEditBtn',
        valueId: 'districtValue',
        editSectionId: 'districtEdit',
        saveBtnId: 'districtSave',
        cancelBtnId: 'districtCancel',
        inputId: 'districtSelect',
        disabled: !cooldownStatus.canEdit,
        getCurrentValue: function () { return data.district; },
        onSave: async function (newValue) {
            var result = await ConvexService.mutation('users:updateDistrictMonthly', {
                phoneNumber: phoneNumber,
                district: newValue
            });
            if (result && !result.success) {
                showToast(result.message, 'error');
                throw new Error(result.message);
            }
            data.district = newValue;
            data.districtLastChanged = Date.now();
            document.getElementById('districtValue').textContent = newValue;
            document.getElementById('districtValue').classList.remove('profile-row-value--muted');

            // Show cooldown hint
            var cooldownEl = document.getElementById('districtCooldown');
            var newCooldown = checkDistrictCooldown(Date.now());
            if (!newCooldown.canEdit) {
                document.getElementById('districtCooldownText').textContent =
                    'Can change after ' + newCooldown.nextChangeDate;
                cooldownEl.style.display = '';
            }

            // Disable edit button after save
            document.getElementById('districtEditBtn').disabled = true;

            showToast('District updated to ' + newValue + '!', 'success');
        }
    });
}

// ========== LOGOUT ==========
document.getElementById('logoutBtn').addEventListener('click', async function () {
    try {
        await logoutUser();
        window.location.href = 'index.html';
    } catch (err) {
        console.error('Logout error:', err);
        showToast('Logout failed', 'error');
    }
});
