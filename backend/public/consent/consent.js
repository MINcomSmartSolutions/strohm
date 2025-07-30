// Consent Page JavaScript
document.addEventListener('DOMContentLoaded', function () {
    try {
        const checkbox = document.getElementById('consent_checkbox');
        const submitBtn = document.getElementById('submitBtn');
        const declineBtn = document.getElementById('declineBtn');
        const form = document.getElementById('consentForm');
        const errorDiv = document.getElementById('error');

        if (checkbox && submitBtn) {
            checkbox.addEventListener('change', function () {
                submitBtn.disabled = !this.checked;

                // Clear any previous error
                if (errorDiv) {
                    errorDiv.style.display = 'none';
                }
            });

            checkbox.addEventListener('click', function () {
            });
        } else {
            console.error('Required elements not found!');
        }

        // Decline button handler
        if (declineBtn) {
            declineBtn.addEventListener('click', function () {
                window.location.href = '/logout';
            });
        }

        // Form submission handler
        if (form) {
            form.addEventListener('submit', function (e) {
                console.log('*** FORM SUBMITTED ***', checkbox?.checked);
                if (!checkbox?.checked) {
                    e.preventDefault();
                    if (errorDiv) {
                        errorDiv.textContent = 'You must accept the terms to continue.';
                        errorDiv.style.display = 'block';
                    }
                } else {
                }
            });
        }
    } catch (error) {
        console.error('JavaScript error:', error);
    }

});

