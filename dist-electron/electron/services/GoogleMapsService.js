"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleMapsService = void 0;
exports.getGoogleMapsService = getGoogleMapsService;
const axios_1 = __importDefault(require("axios"));
class GoogleMapsService {
    apiKey;
    baseUrl = 'https://maps.googleapis.com/maps/api/place';
    requestDelay = 500; // 500ms delay between requests
    lastRequestTime = 0;
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    /**
     * Rate limiting: wait before making a request
     */
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelay) {
            await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();
    }
    /**
     * Normalize company name for better search results
     */
    normalizeCompanyName(name) {
        return name
            // パイプ以降を削除
            .split(/[|｜]/)[0]
            // 全角英数字を半角に変換
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            // 全角スペースを半角に
            .replace(/　/g, ' ')
            // 余分な記号を削除
            .replace(/[【】\[\]]/g, '')
            // 余分な空白を整理
            .replace(/\s+/g, ' ')
            .trim();
    }
    /**
     * Find company phone number using Google Maps Places API
     * @param companyName Company name to search for
     * @param address Optional address to improve search accuracy
     * @returns Phone number or null if not found
     */
    async findCompanyPhone(companyName, address) {
        try {
            await this.rateLimit();
            // Normalize company name
            const normalizedName = this.normalizeCompanyName(companyName);
            // Normalize address (remove excess whitespace and newlines)
            const normalizedAddress = address?.replace(/\s+/g, ' ').trim();
            // Build search query
            const query = normalizedAddress ? `${normalizedName} ${normalizedAddress}` : normalizedName;
            // Step 1: Text Search to find the place
            const searchResponse = await axios_1.default.get(`${this.baseUrl}/textsearch/json`, {
                params: {
                    query: query,
                    key: this.apiKey,
                    language: 'ja',
                    region: 'jp',
                },
                timeout: 10000,
            });
            if (searchResponse.data.status !== 'OK' || !searchResponse.data.results?.length) {
                console.log(`[GoogleMaps] No results found for: ${query}`);
                return null;
            }
            const topResult = searchResponse.data.results[0];
            console.log(`[GoogleMaps] Found place: ${topResult.name} (${topResult.place_id})`);
            await this.rateLimit();
            // Step 2: Get Place Details for phone number
            const detailsResponse = await axios_1.default.get(`${this.baseUrl}/details/json`, {
                params: {
                    place_id: topResult.place_id,
                    key: this.apiKey,
                    fields: 'formatted_phone_number,international_phone_number,name,website',
                    language: 'ja',
                },
                timeout: 10000,
            });
            if (detailsResponse.data.status !== 'OK' || !detailsResponse.data.result) {
                console.log(`[GoogleMaps] Could not get details for place_id: ${topResult.place_id}`);
                return null;
            }
            const details = detailsResponse.data.result;
            const phone = details.formatted_phone_number || details.international_phone_number;
            if (phone) {
                console.log(`[GoogleMaps] Found phone: ${phone} for ${details.name}`);
                return phone;
            }
            console.log(`[GoogleMaps] No phone number found for: ${details.name}`);
            return null;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                console.error(`[GoogleMaps] API error: ${error.message}`);
            }
            else {
                console.error(`[GoogleMaps] Error: ${error}`);
            }
            return null;
        }
    }
    /**
     * Batch find phone numbers for multiple companies
     * @param companies Array of company info
     * @param onProgress Progress callback
     * @returns Map of company ID to phone number
     */
    async findPhonesBatch(companies, onProgress) {
        const results = new Map();
        for (let i = 0; i < companies.length; i++) {
            const company = companies[i];
            if (onProgress) {
                onProgress(i + 1, companies.length, company.companyName);
            }
            const phone = await this.findCompanyPhone(company.companyName, company.address);
            if (phone) {
                results.set(company.id, phone);
            }
        }
        return results;
    }
}
exports.GoogleMapsService = GoogleMapsService;
// Singleton instance
let instance = null;
function getGoogleMapsService() {
    if (!instance) {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            console.warn('[GoogleMaps] GOOGLE_MAPS_API_KEY not set in environment');
            return null;
        }
        instance = new GoogleMapsService(apiKey);
    }
    return instance;
}
