const { parsePhoneNumber, getCountryCallingCode } = require('libphonenumber-js');

/**
 * Enrich contact data with additional information
 */
class ContactEnrichment {
  
  /**
   * Guess country from phone number
   */
  static guessCountryFromPhone(phoneNumber) {
    if (!phoneNumber) return null;
    
    try {
      // Clean phone number
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      // Try to parse the phone number
      const parsed = parsePhoneNumber('+' + cleanPhone);
      if (parsed && parsed.isValid()) {
        return parsed.country;
      }
      
      // Fallback: try common country codes
      const countryMappings = {
        '1': 'US',     // US/Canada
        '44': 'GB',    // UK
        '49': 'DE',    // Germany
        '33': 'FR',    // France
        '39': 'IT',    // Italy
        '34': 'ES',    // Spain
        '31': 'NL',    // Netherlands
        '46': 'SE',    // Sweden
        '47': 'NO',    // Norway
        '45': 'DK',    // Denmark
        '41': 'CH',    // Switzerland
        '43': 'AT',    // Austria
        '32': 'BE',    // Belgium
        '351': 'PT',   // Portugal
        '353': 'IE',   // Ireland
        '358': 'FI',   // Finland
        '91': 'IN',    // India
        '86': 'CN',    // China
        '81': 'JP',    // Japan
        '82': 'KR',    // South Korea
        '61': 'AU',    // Australia
        '64': 'NZ',    // New Zealand
        '55': 'BR',    // Brazil
        '52': 'MX',    // Mexico
        '54': 'AR',    // Argentina
        '56': 'CL',    // Chile
        '57': 'CO',    // Colombia
        '58': 'VE',    // Venezuela
        '51': 'PE',    // Peru
        '27': 'ZA',    // South Africa
        '20': 'EG',    // Egypt
        '971': 'AE',   // UAE
        '966': 'SA',   // Saudi Arabia
        '65': 'SG',    // Singapore
        '60': 'MY',    // Malaysia
        '66': 'TH',    // Thailand
        '84': 'VN',    // Vietnam
        '63': 'PH',    // Philippines
        '62': 'ID',    // Indonesia
      };
      
      // Try different prefix lengths
      for (let len = 1; len <= 4; len++) {
        const prefix = cleanPhone.substring(0, len);
        if (countryMappings[prefix]) {
          return countryMappings[prefix];
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Error parsing phone number:', phoneNumber, error.message);
      return null;
    }
  }
  
  /**
   * Normalize phone number format
   */
  static normalizePhoneNumber(phoneNumber, country = null) {
    if (!phoneNumber) return phoneNumber;
    
    try {
      const parsed = parsePhoneNumber(phoneNumber, country);
      if (parsed && parsed.isValid()) {
        return parsed.formatInternational();
      }
      return phoneNumber;
    } catch (error) {
      return phoneNumber;
    }
  }
  
  /**
   * Extract domain from email
   */
  static extractEmailDomain(email) {
    if (!email || typeof email !== 'string') return null;
    
    const parts = email.split('@');
    return parts.length === 2 ? parts[1].toLowerCase() : null;
  }
  
  /**
   * Guess company from email domain
   */
  static guessCompanyFromEmail(email) {
    const domain = this.extractEmailDomain(email);
    if (!domain) return null;
    
    // Skip common email providers
    const commonProviders = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'protonmail.com', 'mail.com',
      'yandex.com', 'zoho.com', 'fastmail.com'
    ];
    
    if (commonProviders.includes(domain)) {
      return null;
    }
    
    // Extract company name from domain
    const domainParts = domain.split('.');
    if (domainParts.length >= 2) {
      const companyPart = domainParts[0];
      // Capitalize first letter
      return companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
    }
    
    return null;
  }
  
  /**
   * Validate email format
   */
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Clean and normalize name
   */
  static normalizeName(name) {
    if (!name || typeof name !== 'string') return name;
    
    return name
      .trim()
      .split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
  
  /**
   * Enrich a single contact
   */
  static enrichContact(contact) {
    const enriched = { ...contact };
    
    // Normalize email
    if (enriched.email) {
      enriched.email = enriched.email.toLowerCase().trim();
      
      // Validate email
      if (!this.isValidEmail(enriched.email)) {
        throw new Error(`Invalid email format: ${enriched.email}`);
      }
      
      // Guess company from email if not provided
      if (!enriched.company) {
        enriched.company = this.guessCompanyFromEmail(enriched.email);
      }
    }
    
    // Normalize names
    if (enriched.firstName) {
      enriched.firstName = this.normalizeName(enriched.firstName);
    }
    if (enriched.lastName) {
      enriched.lastName = this.normalizeName(enriched.lastName);
    }
    
    // Enrich phone number and guess country
    if (enriched.phone) {
      // Guess country from phone if not provided
      if (!enriched.country) {
        enriched.country = this.guessCountryFromPhone(enriched.phone);
      }
      
      // Normalize phone number
      enriched.phone = this.normalizePhoneNumber(enriched.phone, enriched.country);
    }
    
    return enriched;
  }
  
  /**
   * Enrich multiple contacts
   */
  static enrichContacts(contacts) {
    return contacts.map((contact, index) => {
      try {
        return this.enrichContact(contact);
      } catch (error) {
        console.warn(`Error enriching contact at index ${index}:`, error.message);
        return contact; // Return original if enrichment fails
      }
    });
  }
}

module.exports = ContactEnrichment;
