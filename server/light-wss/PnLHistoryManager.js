const fs = require('fs');
const path = require('path');

class PnLHistoryManager {
    constructor() {
        this.dataDir = path.join(__dirname, 'pnl_data');
        this.ensureDataDir();
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    getFilePath(accountId, mint) {
        return path.join(this.dataDir, `${accountId}_${mint}.json`);
    }

    load(accountId, mint) {
        const filePath = this.getFilePath(accountId, mint);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (err) {
                console.error(`❌ Error loading PnL for ${accountId}_${mint}:`, err.message);
            }
        }
        return {
            totalCost: 0,
            totalAmount: 0,
            realizedPnL: 0,
            trades: []
        };
    }

    save(accountId, mint, data) {
        const filePath = this.getFilePath(accountId, mint);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error(`❌ Error saving PnL for ${accountId}_${mint}:`, err.message);
        }
    }

    addTrade(accountId, mint, trade) {
        const data = this.load(accountId, mint);

        // Add trade to history (limit to last 50 for performance)
        data.trades.unshift({
            txId: trade.txId,
            type: trade.type,
            solAmount: trade.solAmount,
            tokenAmount: trade.tokenAmount,
            usdPricePerToken: trade.usdPricePerToken,
            spotPriceSol: trade.spotPriceSol,
            timestamp: trade.timestamp
        });
        data.trades = data.trades.slice(0, 50);

        if (trade.type === 'buy') {
            data.totalCost += trade.solAmount;
            data.totalAmount += trade.tokenAmount;
        } else if (trade.type === 'sell') {
            if (data.totalAmount > 0) {
                // Determine how many tokens we have cost basis for
                const amountWithCostBasis = Math.min(trade.tokenAmount, data.totalAmount);
                const costBasisPerToken = data.totalCost / data.totalAmount;
                const costOfSoldTokens = costBasisPerToken * amountWithCostBasis;

                // Profit = total received for all tokens - cost of tracked portion
                // (Excess tokens are assumed cost 0)
                data.realizedPnL += (trade.solAmount - costOfSoldTokens);

                // Update remaining basis
                data.totalAmount -= amountWithCostBasis;
                if (data.totalAmount <= 0) {
                    data.totalAmount = 0;
                    data.totalCost = 0;
                } else {
                    data.totalCost -= costOfSoldTokens;
                }
            } else {
                // Selling tokens with no recorded cost basis (assume 100% profit)
                data.realizedPnL += trade.solAmount;
            }
        }

        this.save(accountId, mint, data);
        return data;
    }

    recalculate(accountId, mint) {
        const filePath = this.getFilePath(accountId, mint);
        if (!fs.existsSync(filePath)) return null;

        const data = this.load(accountId, mint);
        if (!data.trades || data.trades.length === 0) return data;

        // Reset cumulative fields
        const trades = [...data.trades].reverse(); // Processing from oldest to newest
        const newData = {
            totalCost: 0,
            totalAmount: 0,
            realizedPnL: 0,
            trades: data.trades // Keep the same trade list (newest first)
        };

        for (const trade of trades) {
            if (trade.type === 'buy') {
                newData.totalCost += trade.solAmount;
                newData.totalAmount += trade.tokenAmount;
            } else if (trade.type === 'sell') {
                if (newData.totalAmount > 0) {
                    const amountWithCostBasis = Math.min(trade.tokenAmount, newData.totalAmount);
                    const costBasisPerToken = newData.totalCost / newData.totalAmount;
                    const costOfSoldTokens = costBasisPerToken * amountWithCostBasis;

                    newData.realizedPnL += (trade.solAmount - costOfSoldTokens);
                    newData.totalAmount -= amountWithCostBasis;

                    if (newData.totalAmount <= 0.000000000001) { // Floating point safety
                        newData.totalAmount = 0;
                        newData.totalCost = 0;
                    } else {
                        newData.totalCost -= costOfSoldTokens;
                    }
                } else {
                    newData.realizedPnL += trade.solAmount;
                }
            }
        }

        // Clean up floating point residue
        if (newData.totalAmount < 0.000000000001) {
            newData.totalAmount = 0;
            newData.totalCost = 0;
        }

        this.save(accountId, mint, newData);
        return newData;
    }

    reset(accountId, mint) {
        const newData = {
            totalCost: 0,
            totalAmount: 0,
            realizedPnL: 0,
            trades: []
        };
        this.save(accountId, mint, newData);
        return newData;
    }
}

module.exports = new PnLHistoryManager();
