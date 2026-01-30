import axios from 'axios';

interface PlaceSearchResult {
    place_id: string;
    name: string;
    formatted_address?: string;
}

interface PlaceDetailsResult {
    formatted_phone_number?: string;
    international_phone_number?: string;
    name: string;
    website?: string;
}

export class GoogleMapsService {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';
    private readonly requestDelay = 500; // 500ms delay between requests
    private lastRequestTime = 0;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Rate limiting: wait before making a request
     */
    private async rateLimit(): Promise<void> {
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
    private normalizeCompanyName(name: string): string {
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
     * Normalize address for better search results
     * Extract core address (prefecture + city + street number) and remove extra info
     */
    private normalizeAddress(address: string): string {
        // 全角を半角に変換
        let normalized = address
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/　/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // 郵便番号を除去
        normalized = normalized.replace(/〒?\d{3}-?\d{4}\s*/g, '');

        // 不要なキーワードで分割して最初の部分だけ取得
        const stopKeywords = [
            '勤務地', '【交通手段】', '交通手段', 'アクセス', '最寄り駅',
            '※', '（', '(', '徒歩', 'バス', '駅', 'から'
        ];

        for (const keyword of stopKeywords) {
            const idx = normalized.indexOf(keyword);
            if (idx > 10) { // 住所部分を保持するため、最初の10文字以降でのみ切断
                normalized = normalized.substring(0, idx);
            }
        }

        // 都道府県から始まる住所を抽出
        const prefectures = [
            '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
            '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
            '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
            '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
            '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
            '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
            '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
        ];

        for (const pref of prefectures) {
            const idx = normalized.indexOf(pref);
            if (idx !== -1) {
                normalized = normalized.substring(idx);
                break;
            }
        }

        // 市区町村 + 番地までを抽出（ビル名などを除去）
        // 例: 東京都中央区銀座1-16-7 → これだけ保持
        const addressMatch = normalized.match(
            /^(北海道|.{2,3}[都道府県]).{1,4}[市区町村郡].{0,10}?\d+[-−]\d+(?:[-−]\d+)?/
        );

        if (addressMatch) {
            return addressMatch[0].trim();
        }

        // マッチしない場合は最初の30文字程度を使用
        return normalized.substring(0, 30).trim();
    }

    /**
     * Find company phone number using Google Maps Places API
     * @param companyName Company name to search for
     * @param address Optional address to improve search accuracy
     * @returns Phone number or null if not found
     */
    async findCompanyPhone(companyName: string, address?: string | null): Promise<string | null> {
        try {
            await this.rateLimit();

            // Normalize company name
            const normalizedName = this.normalizeCompanyName(companyName);

            // Normalize address (extract core address only)
            const normalizedAddress = address ? this.normalizeAddress(address) : null;

            // Build search query
            const query = normalizedAddress ? `${normalizedName} ${normalizedAddress}` : normalizedName;
            console.log(`[GoogleMaps] Search query: ${query}`);

            // Step 1: Text Search to find the place
            const searchResponse = await axios.get(`${this.baseUrl}/textsearch/json`, {
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

            const topResult: PlaceSearchResult = searchResponse.data.results[0];
            console.log(`[GoogleMaps] Found place: ${topResult.name} (${topResult.place_id})`);

            await this.rateLimit();

            // Step 2: Get Place Details for phone number
            const detailsResponse = await axios.get(`${this.baseUrl}/details/json`, {
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

            const details: PlaceDetailsResult = detailsResponse.data.result;
            const phone = details.formatted_phone_number || details.international_phone_number;

            if (phone) {
                console.log(`[GoogleMaps] Found phone: ${phone} for ${details.name}`);
                return phone;
            }

            console.log(`[GoogleMaps] No phone number found for: ${details.name}`);
            return null;

        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`[GoogleMaps] API error: ${error.message}`);
            } else {
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
    async findPhonesBatch(
        companies: Array<{ id: number; companyName: string; address?: string | null }>,
        onProgress?: (current: number, total: number, companyName: string) => void
    ): Promise<Map<number, string>> {
        const results = new Map<number, string>();

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

// Singleton instance
let instance: GoogleMapsService | null = null;

export function getGoogleMapsService(): GoogleMapsService | null {
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
