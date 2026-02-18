/**
 * Profile Page Logic
 * Handles loading user data, inline editing, avatar upload, and Google Sheets integration.
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
var biasEmoji = {
    'Jisoo': '💖',
    'Jennie': '🐻',
    'Rosé': '🌹',
    'Rose': '🌹',
    'Lisa': '🐱',
    'OT4': '🖤💗'
};

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
    var emoji = biasEmoji[bias] || '';
    return bias + ' ' + emoji;
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
                joinedDate: data.joinedDate || null
            };
        }
    } catch (err) {
        console.warn('[Profile] Could not fetch sheet data:', err);
    }
    return null;
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

// ========== AVATAR UPLOAD ==========
function setupAvatarUpload() {
    var input = document.getElementById('avatarInput');
    var avatarEl = document.getElementById('profileAvatar');

    if (!input || !avatarEl) return;

    input.addEventListener('change', async function () {
        var file = this.files[0];
        if (!file) return;

        // Validate file size (max 500KB for Convex string storage)
        if (file.size > 500 * 1024) {
            showToast('Image too large. Max 500KB.', 'error');
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file', 'error');
            return;
        }

        try {
            // Resize and compress the image
            var dataUrl = await resizeImage(file, 200, 200, 0.8);

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

function resizeImage(file, maxWidth, maxHeight, quality) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                var w = img.width;
                var h = img.height;

                // Calculate new dimensions
                if (w > h) {
                    if (w > maxWidth) {
                        h = Math.round(h * maxWidth / w);
                        w = maxWidth;
                    }
                } else {
                    if (h > maxHeight) {
                        w = Math.round(w * maxHeight / h);
                        h = maxHeight;
                    }
                }

                // Crop to square
                var size = Math.min(w, h);
                canvas.width = size;
                canvas.height = size;

                var ctx = canvas.getContext('2d');
                var sx = (img.width - Math.min(img.width, img.height)) / 2;
                var sy = (img.height - Math.min(img.width, img.height)) / 2;
                var sSize = Math.min(img.width, img.height);

                ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, size, size);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
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

        // Fetch additional data from Google Sheet (bias & join date)
        fetchSheetDataAndFill(phoneNumber);

        // Setup avatar upload
        setupAvatarUpload();

        // Setup inline editors
        setupEditors(profileData);

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
    document.getElementById('profilePhoneDisplay').textContent = maskPhone(data.phoneNumber);

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

    // Registration date from Convex (join date for the website)
    var joinText = document.getElementById('joinDateText');
    if (data.registeredAt) {
        joinText.textContent = 'Member since ' + formatDate(data.registeredAt);
    } else {
        joinText.textContent = 'Member';
    }
}

// ========== FETCH SHEET DATA ==========
async function fetchSheetDataAndFill(phone) {
    var sheetData = await fetchSheetMemberData(phone);
    if (!sheetData) return;

    // Joined community date from sheet
    var joinedVal = document.getElementById('joinedCommunityValue');
    if (sheetData.joinedDate) {
        joinedVal.textContent = sheetData.joinedDate;
        joinedVal.classList.remove('profile-row-value--muted');
        document.getElementById('sheetBadge').style.display = '';
    } else {
        joinedVal.innerHTML = '<span class="profile-row-value--muted">Not available</span>';
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

    // Bias editor
    setupInlineEdit({
        editBtnId: 'biasEditBtn',
        valueId: 'biasValue',
        editSectionId: 'biasEdit',
        saveBtnId: 'biasSave',
        cancelBtnId: 'biasCancel',
        inputId: 'biasSelect',
        getCurrentValue: function () { return data.bias; },
        onSave: async function (newValue) {
            await ConvexService.mutation('users:updateBias', {
                phoneNumber: phoneNumber,
                bias: newValue
            });
            data.bias = newValue;
            var biasVal = document.getElementById('biasValue');
            biasVal.textContent = formatBias(newValue);
            biasVal.className = 'profile-row-value ' + (biasClass[newValue] || '');
            showToast('Bias updated! ' + (biasEmoji[newValue] || ''), 'success');
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
