/**
 * @file Database initialization script for consent functionality
 * This script creates an initial consent revision that will be active by default
 */

const {createConsentRevision} = require('#services/consent');
const logger = require('#services/logger');

const initializeConsent = async () => {
    try {
        const initialConsentContent = `
Welcome to Strohm Electric Vehicle Charging Platform

By using our services, you agree to the following terms and conditions:

DATA COLLECTION AND USAGE:
- We collect personal information including your name, email address, and charging session data
- Your data is used to provide charging services, billing, and customer support
- We may share anonymized usage statistics for service improvement

CHARGING SERVICES:
- You agree to use our charging stations responsibly and in accordance with safety guidelines
- Charging fees will be automatically billed to your registered payment method
- You are responsible for any damages caused by misuse of our equipment

PRIVACY AND SECURITY:
- We implement industry-standard security measures to protect your data
- Your personal information will not be sold to third parties for marketing purposes
- You may request access to or deletion of your personal data at any time

ACCOUNT MANAGEMENT:
- You are responsible for maintaining the security of your account credentials
- Notify us immediately of any unauthorized use of your account
- We reserve the right to suspend accounts that violate our terms of service

LIABILITY:
- Our liability is limited to the amount paid for charging services
- We are not responsible for damages to your vehicle beyond our direct negligence
- Emergency contact information should be available during charging sessions

MODIFICATIONS:
- We may update these terms from time to time
- Continued use of our services constitutes acceptance of updated terms
- You will be notified of significant changes to our terms and privacy policy

By accepting these terms, you acknowledge that you have read, understood, and agree to be bound by these conditions.
        `.trim();

        const consentRevision = createConsentRevision(
            '1.0',
            'Terms of Service and Privacy Agreement',
            initialConsentContent,
            'https://min2sol.com/datenschutz/', // Replace with actual privacy policy URL
            'https://min2sol.com/datenschutz/', // Replace with actual terms URL
        );

        logger.info('Initial consent revision created successfully:', consentRevision);
        logger.info('✅ Initial consent revision created successfully');
        logger.info('Version:', consentRevision.version);
        logger.info('Title:', consentRevision.title);

    } catch (error) {
        logger.error('Failed to initialize consent:', error);
        throw error;
    }
};

// Run initialization if this script is executed directly
if (require.main === module) {
    initializeConsent()
        .then(() => {
            console.log('Consent initialization completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Consent initialization failed:', error);
            process.exit(1);
        });
}

module.exports = {initializeConsent};
