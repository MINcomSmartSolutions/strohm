// Consent Page JavaScript
document.addEventListener('DOMContentLoaded', function () {
    try {
        const checkbox = document.getElementById('consent_checkbox');
        const submitBtn = document.getElementById('submitBtn');
        const declineBtn = document.getElementById('declineBtn');
        const form = document.getElementById('consentForm');
        const errorDiv = document.getElementById('error');
        const versionInput = document.querySelector('input[name="consent_version"]');

        // Get consent version for tracking
        const consentVersion = versionInput ? versionInput.value : 'unknown';
        console.log('Consent form loaded for version:', consentVersion);

        if (checkbox && submitBtn) {
            checkbox.addEventListener('change', function () {
                submitBtn.disabled = !this.checked;

                // Clear any previous error
                if (errorDiv) {
                    errorDiv.style.display = 'none';
                }

                submitBtn.textContent = `Akzeptieren und fortfahren`;
            });

            // Add focus indicator for accessibility
            checkbox.addEventListener('focus', function () {
                this.parentElement.classList.add('focused');
            });

            checkbox.addEventListener('blur', function () {
                this.parentElement.classList.remove('focused');
            });
        } else {
            console.error('Required consent form elements not found!');
        }

        // Decline button handler
        if (declineBtn) {
            declineBtn.addEventListener('click', function () {
                const confirmDecline = confirm(
                    'Sind Sie sicher, dass Sie die Bedingungen ablehnen möchten? ' +
                    'Dies führt zur Abmeldung und Sie können die Anwendung nicht nutzen.'
                );

                if (confirmDecline) {
                    console.log('User declined consent version:', consentVersion);
                    window.location.href = '/logout?reason=consent_declined';
                }
            });
        }

        // Form submission handler
        if (form) {
            form.addEventListener('submit', function (e) {
                console.log('*** CONSENT FORM SUBMITTED ***');
                console.log('Consent version:', consentVersion);
                console.log('Checkbox checked:', checkbox?.checked);

                if (!checkbox?.checked) {
                    e.preventDefault();
                    if (errorDiv) {
                        errorDiv.textContent = `Sie müssen Version ${consentVersion} der Bedingungen akzeptieren, um fortzufahren.`;
                        errorDiv.style.display = 'block';
                    }
                    return false;
                }

                // Disable form to prevent double submission
                submitBtn.disabled = true;
                submitBtn.textContent = 'Wird verarbeitet...';

                // Add loading indicator
                submitBtn.classList.add('loading');

                console.log('Submitting consent for version:', consentVersion);
            });
        }

        // Add version info to page title for debugging
        if (consentVersion !== 'unknown') {
            document.title = `${document.title} (v${consentVersion})`;
        }

        // Check for version changes (in case user left page open while version was updated)
        let originalVersion = consentVersion;
        setInterval(() => {
            const currentVersionInput = document.querySelector('input[name="consent_version"]');
            const currentVersion = currentVersionInput ? currentVersionInput.value : 'unknown';

            if (currentVersion !== originalVersion && currentVersion !== 'unknown') {
                console.warn('Consent version changed from', originalVersion, 'to', currentVersion);

                // Show notification to user
                if (confirm(
                    'Die Einverständniserklärung wurde aktualisiert. ' +
                    'Möchten Sie die Seite neu laden, um die neueste Version anzuzeigen?'
                )) {
                    window.location.reload();
                }
            }
        }, 30000); // Check every 30 seconds

    } catch (error) {
        console.error('JavaScript error in consent form:', error);

        // Fallback error handling
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.textContent = 'Es ist ein Fehler aufgetreten. Bitte laden Sie die Seite neu.';
            errorDiv.style.display = 'block';
        }
    }
});
