/**
 * @file Database initialization script for consent functionality
 * This script creates an initial consent revision that will be active by default
 */

const {createConsentRevision} = require('#services/consent');
const logger = require('#services/logger');

const initializeConsent = async () => {
    try {
        const initialConsentContent = `
§ 1 Geltungsbereich und Vertragspartner
Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung des Dienstes HM-Laden (nachfolgend "Dienst"), für den sich Berechtigte über die Website https://laden.hm.edu registrieren können.
Vertragspartner (nachfolgend „Anbieter“) ist 
Hochschule München – Munich University of Applied Sciences
Lothstraße 64
80335 München
§ 2 Leistungsbeschreibung
Der Anbieter stellt den Nutzern den Dienst HM-Laden zur Verfügung. Berechtigte Nutzer sind die Angestellten der Hochschule München. Berechtigte Nutzer, die sich registriert haben, können an den von HM-Laden angebotenen Ladepunkten ein Elektrofahrzeug laden. Diese Ladepunkte sind an einem QR-Code erkenntlich, der auf die Portal- und Registrierungsseite https://laden.hm.edu zeigt.
Aus dem Serviceangebot ergibt sich kein Anspruch der berechtigten Nutzer an den Anbieter, den Dienst auch in Zukunft oder unterhalb einer bestimmten Preisgrenze anbieten zu müssen.
§ 3 Kostenfreie Nutzung bis 31.12.2025
Bis einschließlich 31. Dezember 2025 wird der Dienst kostenlos zur Verfügung gestellt. Die Nutzung erfolgt "as is" ohne jegliche Gewährleistung oder Garantie seitens des Anbieters.
§ 4 Kostenpflichtige Nutzung ab 01.01.2026
Ab dem 1. Januar 2026 wird die Nutzung des Dienstes kostenpflichtig. Die aktuell gültigen Preise können jederzeit unter https://laden.hm.edu/preise.html eingesehen werden.
Preisänderungen werden dem Nutzer spätestens 3 Stunden vor ihrem Inkrafttreten über die Website mitgeteilt.
§ 5 Vertragsschluss und Zahlung
Mit der ersten kostenpflichtigen Nutzung ab dem 1. Januar 2026 kommt ein Nutzungsvertrag zu den dann gültigen Preisen zustande. Die Zahlung erfolgt jeweils nach Abschluss einer Ladesession. Näheres zu den angebotenen Bezahlmethoden wird bis 31.12.2025 bekanntgegeben.
§ 6 Haftungsausschluss
Der Anbieter haftet nicht für Schäden, die durch die Nutzung oder Nichtverfügbarkeit des Dienstes entstehen, soweit gesetzlich zulässig. Dies gilt insbesondere für die kostenfreie Nutzungsphase bis 31.12.2025.
Die Haftung für Vorsatz und grobe Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit bleibt unberührt.
§ 7 Verfügbarkeit
Der Anbieter bemüht sich um eine hohe Verfügbarkeit des Dienstes, übernimmt jedoch keine Gewähr für eine ununterbrochene Erreichbarkeit.
§ 8 Datenschutz
Für die Verarbeitung personenbezogener Daten gelten die Bestimmungen der Datenschutzerklärung, die unter https://laden.hm.edu/datenschutz.html abrufbar ist.
§ 9 Kündigung
Kosten fallen nur bei der Nutzung des Dienstes an; die Registrierung verursacht weder einmalige noch laufende Kosten. Nutzer können die Nutzung jederzeit ohne Einhaltung einer Frist einstellen. 
Sollte der Nutzer trotz Kostenfreiheit von seiner Registrierung zurücktreten wollen, kann er dies in Form eines DSGVO-Löschverlangens bewirken, sofern der Anbieter keine offenen Forderungen gegen ihn hat.
§ 10 Änderungen der AGB
Der Anbieter behält sich vor, diese AGB mit einer Frist von 14 Tagen zu ändern. Widerspricht der Nutzer nicht innerhalb dieser Frist, gelten die Änderungen als angenommen.
§ 11 Schlussbestimmungen
Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Erfüllungsort und Gerichtsstand ist München.
Sollten einzelne Bestimmungen unwirksam sein, berührt dies die Wirksamkeit der übrigen Bestimmungen nicht.
Stand: Oktober 2025
        `.trim();

        const consentRevision = createConsentRevision(
            '1.0',
            'Allgemeine Geschäftsbedingungen (AGB) für HM-Laden',
            initialConsentContent,
            'https://min2sol.com/datenschutz/', // Replace with actual privacy policy URL
            'https://min2sol.com/datenschutz/', // Replace with actual terms URL
        );

        logger.info('Initial consent revision created successfully:', consentRevision);
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
