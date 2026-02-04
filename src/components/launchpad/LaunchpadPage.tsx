"use client";

import React, { useState, useEffect } from "react";
import DistributeSolModal from "@/components/terminal/DistributeSolModal";

type OperatorProps = {
    accountId: string;
    userTier: string;
    is2faEnabled: boolean;
};

type LaunchpadPageProps = {
    operator: OperatorProps | null;
};



const shortenAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
};

const LaunchpadPage = ({ operator }: LaunchpadPageProps) => {
    // Wallet State
    const [connectedWallets, setConnectedWallets] = useState<any[]>([]);
    const [walletConnectionStatus, setWalletConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [currentCoin] = useState<string>('So11111111111111111111111111111112');
    const [wssConnection, setWssConnection] = useState<WebSocket | null>(null);

    // WSS Connection
    useEffect(() => {
        if (!operator || typeof window === 'undefined') {
            setWalletConnectionStatus('disconnected');
            return;
        }

        const connectToWSS = async () => {
            try {
                const authResponse = await fetch('/api/wallets/authenticate-wss', { method: 'POST' });
                if (!authResponse.ok) {
                    setWalletConnectionStatus('disconnected');
                    return;
                }
                const authData = await authResponse.json();

                const LIGHT_WSS_URL = process.env.NEXT_PUBLIC_LIGHT_WSS_URL ||
                    (process.env.NODE_ENV === 'production' ? 'wss://light.a-trade.fun' : 'ws://localhost:4128');

                const ws = new WebSocket(`${LIGHT_WSS_URL}?sessionId=${authData.sessionId}`);

                ws.onopen = () => {
                    setWssConnection(ws);
                    setWalletConnectionStatus('connecting');
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'auth_success') {
                            ws.send(JSON.stringify({
                                type: 'wallet_data_request',
                                requestId: `auth_${Date.now()}`,
                                currentCoin: currentCoin
                            }));
                        } else if (data.type === 'wallet_data_response' && data.success) {
                            setConnectedWallets(data.wallets || []);
                            setWalletConnectionStatus((data.wallets || []).length > 0 ? 'connected' : 'disconnected');
                        } else if (data.type === 'wallet_client_connected') {
                            setWalletConnectionStatus('connected');
                            ws.send(JSON.stringify({
                                type: 'wallet_data_request',
                                requestId: `refresh_${Date.now()}`,
                                currentCoin: currentCoin
                            }));
                        } else if (data.type === 'wallet_client_disconnected') {
                            setWalletConnectionStatus('disconnected');
                            setConnectedWallets([]);
                        } else if (data.type === 'wallet_update') {
                            setConnectedWallets(data.wallets || []);
                            setWalletConnectionStatus((data.wallets || []).length > 0 ? 'connected' : 'disconnected');
                        } else if (data.type === 'balance_update') {
                            setConnectedWallets(currentWallets => {
                                return currentWallets.map(wallet => {
                                    const balanceUpdate = data.wallets.find((update: any) => update.publicKey === wallet.publicKey);
                                    if (balanceUpdate) {
                                        return {
                                            ...wallet,
                                            solBalance: balanceUpdate.solBalance,
                                            splBalance: balanceUpdate.splBalance || 0,
                                            lastUpdated: balanceUpdate.lastUpdated
                                        };
                                    }
                                    return wallet;
                                });
                            });
                        } else if (data.type === 'bundle_launch_response') {
                            if (data.success) {
                                if (launchStateRef.current.remainingWallets.length > 0) {
                                    // SAFE MODE: Launch success, now process remaining wallets
                                    launchStateRef.current.mintAddress = data.mintAddress;
                                    setLaunchProgress({ percentage: 50, currentProcess: `Launch Confirmed! Processing next batch...` });
                                    showToast(`Launch Confirmed! Starting follow-up buys...`);

                                    // Trigger next batch immediately
                                    processNextSafeBatch(ws);
                                } else {
                                    // TURBO or Completed Safe Mode
                                    setLaunchProgress({ percentage: 100, currentProcess: "Launch Successful!" });
                                    showToast(`Launch Successful! Mint: ${data.mintAddress}`);
                                    setIsLaunchInProgress(false);
                                    launchStateRef.current.isProcessing = false;
                                }
                            } else {
                                showToast(`Launch Failed: ${data.error}`);
                                setIsLaunchInProgress(false);
                                launchStateRef.current.isProcessing = false;
                            }
                        } else if (data.type === 'bundle_buy_response') {
                            if (data.success) {
                                if (launchStateRef.current.remainingWallets.length > 0) {
                                    // Continue to next batch
                                    setLaunchProgress({ percentage: 70, currentProcess: `Batch Confirmed! Processing next...` });
                                    processNextSafeBatch(ws);
                                } else {
                                    // All done
                                    setLaunchProgress({ percentage: 100, currentProcess: "All Bundles Executed!" });
                                    showToast(`Execution Sequence Complete!`);
                                    setIsLaunchInProgress(false);
                                    launchStateRef.current.isProcessing = false;
                                }
                            } else {
                                showToast(`Bundle Buy Failed: ${data.error}`);
                                // Don't stop? Or stop? Probably stop to prevent losses?
                                // For now, let's stop but leave state open? 
                                // Ideally we might want to continue or retry, but let's pause.
                                setIsLaunchInProgress(false);
                                launchStateRef.current.isProcessing = false;
                            }
                        }
                    } catch (e) {
                        console.error("WSS Parse Error", e);
                    }
                };

                // Helper to process next Safe Mode batch
                const processNextSafeBatch = (websocket: WebSocket) => {
                    const BATCH_SIZE = 5; // Fixed batch size for follow-up buys (fits nicely in Jito limit)
                    const nextBatch = launchStateRef.current.remainingWallets.slice(0, BATCH_SIZE);
                    const remaining = launchStateRef.current.remainingWallets.slice(BATCH_SIZE);

                    launchStateRef.current.remainingWallets = remaining;

                    if (nextBatch.length === 0) {
                        setLaunchProgress({ percentage: 100, currentProcess: "Execution Complete!" });
                        showToast("Safe Mode Sequence Finished!");
                        setIsLaunchInProgress(false);
                        launchStateRef.current.isProcessing = false;
                        return;
                    }

                    console.log(`🛡️ Safe Mode: Sending batch of ${nextBatch.length} wallets...`);

                    websocket.send(JSON.stringify({
                        type: 'bundle_buy_request',
                        requestId: launchStateRef.current.requestId,
                        wallets: nextBatch,
                        mintAddress: launchStateRef.current.mintAddress,
                        tokenInfo: launchStateRef.current.tokenInfo, // Included just in case
                        slippage: 5, // Higher slippage for follow-ups
                        protocol: 'v1', // Assuming Pump V1 for now
                        useJito: true,
                        processMode: launchStateRef.current.tokenInfo?.processMode || "normal"
                    }));
                };

                ws.onclose = () => {
                    setWssConnection(null);
                    setWalletConnectionStatus('disconnected');
                    setConnectedWallets([]);
                };

                return ws;
            } catch (e) {
                console.error("WSS Connection Error", e);
                setWalletConnectionStatus('disconnected');
            }
        };

        const wsPromise = connectToWSS();
        return () => {
            wsPromise.then(ws => ws?.close());
        };
    }, [operator, currentCoin]);

    // Token configuration state
    const [tokenData, setTokenData] = useState({
        name: "",
        symbol: "",
        description: "",
        twitter: "",
        telegram: "",
        website: "",
        platform: "pumpfun",
        launchType: "single",
    });

    const [tokenImage, setTokenImage] = useState<File | null>(null);
    const [useCustomCA, setUseCustomCA] = useState("0");
    const [customPrivateKey, setCustomPrivateKey] = useState("");
    const [showSocialInfo, setShowSocialInfo] = useState(false);

    // Launch strategy state
    const [launchStrategy, setLaunchStrategy] = useState("pentad");
    const [processMode, setProcessMode] = useState<"normal" | "mayhem">("normal");
    const [executionMode, setExecutionMode] = useState<"turbo" | "safe">("turbo");

    // Modal & Toast states
    const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // Wallet selection state

    const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
    const [walletRoles, setWalletRoles] = useState<Record<string, string>>({});
    const [walletAmounts, setWalletAmounts] = useState<Record<string, string>>({});
    const [devWalletIndex, setDevWalletIndex] = useState<string | null>(null);

    // Tab state
    const [activeTab, setActiveTab] = useState<"wallets" | "participants">("wallets");

    // Progress state
    const [launchProgress, setLaunchProgress] = useState({
        percentage: 0,
        currentProcess: "",
    });
    const [isLaunchInProgress, setIsLaunchInProgress] = useState(false);

    // Amount configuration
    const [amountInput, setAmountInput] = useState("");
    const [targetAmount, setTargetAmount] = useState("");
    const [useTargetAmount, setUseTargetAmount] = useState(false);
    const [randomPercentage, setRandomPercentage] = useState(60);
    const [minPercentage, setMinPercentage] = useState(20);

    // Safe Mode State Tracker
    const launchStateRef = React.useRef<{
        isProcessing: boolean;
        mode: "turbo" | "safe";
        remainingWallets: any[];
        mintAddress: string | null;
        tokenInfo: any;
        requestId: string;
    }>({ isProcessing: false, mode: "turbo", remainingWallets: [], mintAddress: null, tokenInfo: null, requestId: "" });

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setTokenImage(file);
        }
    };

    const calculateRandomizedAmount = (walletId: string) => {
        const wallet = connectedWallets.find(w => w.id === walletId);
        if (!wallet) return '';

        if (useTargetAmount && targetAmount) {
            const target = parseFloat(targetAmount);
            if (!isNaN(target) && target > 0) {
                const totalBalance = selectedWallets.reduce((total, id) => {
                    const w = connectedWallets.find(w => w.id === id);
                    return total + (w?.solBalance || 0);
                }, 0);

                if (totalBalance > 0) {
                    const minPercent = minPercentage / 100;
                    const maxPercent = randomPercentage / 100;
                    const randomPercent = Math.random() * (maxPercent - minPercent) + minPercent;
                    const randomizedAmount = (wallet.solBalance || 0) * randomPercent;
                    const finalAmount = Math.min(randomizedAmount, wallet.solBalance || 0);
                    return (wallet.solBalance || 0) > 0 ? Math.max(finalAmount, 0.000001).toFixed(3) : '';
                }
            }
            return '';
        } else {
            const minPercent = minPercentage / 100;
            const maxPercent = randomPercentage / 100;
            const randomPercent = Math.random() * (maxPercent - minPercent) + minPercent;
            const amount = (wallet.solBalance || 0) * randomPercent;
            return Math.max(amount, 0.000001).toFixed(3);
        }
    };

    const handleMainAmountChange = (value: string) => {
        setAmountInput(value);
        const amounts = value.split(',').map(amount => amount.trim());
        const newAmounts: Record<string, string> = { ...walletAmounts };

        if (amounts.length === 1 && amounts[0] !== '') {
            selectedWallets.forEach(walletId => {
                newAmounts[walletId] = amounts[0];
            });
        } else {
            selectedWallets.forEach((walletId, i) => {
                newAmounts[walletId] = amounts[i] || '';
            });
        }
        setWalletAmounts(newAmounts);
    };

    const handleWalletSelect = (walletId: string) => {

        if (selectedWallets.includes(walletId)) {
            // Deselect
            setSelectedWallets((prev) => prev.filter((id) => id !== walletId));
            setWalletRoles((prev) => {
                const updated = { ...prev };
                delete updated[walletId];
                return updated;
            });
            setWalletAmounts((prev) => {
                const updated = { ...prev };
                delete updated[walletId];
                return updated;
            });
            if (devWalletIndex === walletId) setDevWalletIndex(null);
        } else {
            // Select
            setSelectedWallets((prev) => [...prev, walletId]);
            setWalletRoles((prev) => ({ ...prev, [walletId]: "participant" }));
        }
    };

    const handleWalletRoleChange = (walletIndex: string, role: string) => {
        setWalletRoles((prev) => ({ ...prev, [walletIndex]: role }));
        if (role === "dev") {
            if (devWalletIndex !== null && devWalletIndex !== walletIndex) {
                setWalletRoles((prev) => ({ ...prev, [devWalletIndex]: "participant" }));
            }
            setDevWalletIndex(walletIndex);
        } else if (devWalletIndex === walletIndex) {
            setDevWalletIndex(null);
        }
    };

    const handleWalletAmountChange = (walletIndex: string, amount: string) => {
        setWalletAmounts((prev) => ({ ...prev, [walletIndex]: amount }));
    };

    const getWalletRole = (walletIndex: string) => {
        return walletRoles[walletIndex] || "participant";
    };

    const getWalletAmount = (walletIndex: string) => {
        return walletAmounts[walletIndex] || "";
    };

    const checkLaunchRequirements = () => {
        if (!tokenData.name || !tokenData.symbol) return "Set token symbol & name";
        if (!tokenImage) return "Upload token image";
        if (selectedWallets.length < 2) return "Select at least 2 wallets";
        if (devWalletIndex === null) return "Set dev wallet";
        return "Ready to launch";
    };

    const uploadMetadata = async (): Promise<string | null> => {
        try {
            if (!tokenImage) {
                showToast("Please upload a token image first.");
                return null;
            }

            setLaunchProgress({ percentage: 5, currentProcess: "Getting Image Pre-sign URL..." });

            // 1. Get pre-sign URL for image
            const presignImageRes = await fetch("https://pump.fun/api/ipfs-presign");
            const presignImageData = await presignImageRes.json();
            if (!presignImageData.data) throw new Error("Failed to get image pre-sign URL");

            setLaunchProgress({ percentage: 10, currentProcess: "Uploading Image to IPFS..." });

            // 2. Upload image to Pinata
            const imageFormData = new FormData();
            imageFormData.append("file", tokenImage);
            imageFormData.append("network", "public");
            imageFormData.append("name", tokenImage.name);

            const uploadImageRes = await fetch(presignImageData.data, {
                method: "POST",
                body: imageFormData,
            });
            const uploadImageData = await uploadImageRes.json();
            if (!uploadImageData.data?.cid) throw new Error("Failed to upload image to IPFS");

            const imageCid = uploadImageData.data.cid;
            const imageUrl = `https://ipfs.io/ipfs/${imageCid}`;

            setLaunchProgress({ percentage: 20, currentProcess: "Getting Metadata Pre-sign URL..." });

            // 3. Get pre-sign URL for metadata JSON
            const presignJsonRes = await fetch("https://pump.fun/api/ipfs-presign");
            const presignJsonData = await presignJsonRes.json();
            if (!presignJsonData.data) throw new Error("Failed to get metadata pre-sign URL");

            setLaunchProgress({ percentage: 30, currentProcess: "Uploading Metadata to IPFS..." });

            // 4. Construct and upload metadata JSON
            const metadata = {
                name: tokenData.name,
                symbol: tokenData.symbol,
                description: tokenData.description,
                image: imageUrl,
                showName: true,
                createdOn: "https://pump.fun",
                twitter: tokenData.twitter || undefined,
                telegram: tokenData.telegram || undefined,
                website: tokenData.website || undefined,
            };

            const jsonBlob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
            const jsonFormData = new FormData();
            jsonFormData.append("file", jsonBlob, "data.json");
            jsonFormData.append("network", "public");
            jsonFormData.append("name", "data.json");

            const uploadJsonRes = await fetch(presignJsonData.data, {
                method: "POST",
                body: jsonFormData,
            });
            const uploadJsonData = await uploadJsonRes.json();
            if (!uploadJsonData.data?.cid) throw new Error("Failed to upload metadata to IPFS");

            const metadataCid = uploadJsonData.data.cid;
            return `https://ipfs.io/ipfs/${metadataCid}`;

        } catch (error: any) {
            console.error("IPFS Upload Error:", error);
            showToast(`IPFS Upload Failed: ${error.message}`);
            return null;
        }
    };

    const handleLaunch = async () => {
        if (isLaunchInProgress) return;

        const requirements = checkLaunchRequirements();
        if (requirements !== "Ready to launch") {
            showToast(requirements);
            return;
        }

        setIsLaunchInProgress(true);
        setLaunchProgress({ percentage: 0, currentProcess: "Initializing launch sequence..." });

        try {
            // STEP 1: Metadata Upload
            const metadataUri = await uploadMetadata();
            if (!metadataUri) {
                setIsLaunchInProgress(false);
                return;
            }

            setLaunchProgress({ percentage: 40, currentProcess: "Metadata Uploaded!" });
            showToast(`Metadata uploaded: ${metadataUri}`);
            console.log("Token Metadata URI:", metadataUri);

            // STEP 2: Create Token & Multi-buy via Server
            setLaunchProgress({ percentage: 60, currentProcess: "Building Bundles..." });

            // Collect wallet data
            const devWalletIdx = devWalletIndex;
            const devWallet = selectedWallets.find(id => id === devWalletIdx);
            const otherWallets = selectedWallets.filter(id => id !== devWalletIdx);

            // Re-order so dev is always first
            const orderedWallets = [
                { walletId: devWallet, amount: parseFloat(walletAmounts[devWallet!] || "0") },
                ...otherWallets.map(id => ({ walletId: id, amount: parseFloat(walletAmounts[id] || "0") }))
            ];

            // Determine Batch Size for Initial Request
            const LAUNCH_BATCH_SIZES = {
                pentad: 5,
                ignis: 5, // Ignis is random 2-5, max 5 fits in one bundle
                flash: 17, // Flash fits ~17
                echo: 5 // Default
            };

            const batchSize = tokenData.launchType === "single" ? 1 : (LAUNCH_BATCH_SIZES[launchStrategy as keyof typeof LAUNCH_BATCH_SIZES] || 5);

            // Prepare Launch Bundle
            const launchWallets = orderedWallets.slice(0, batchSize);
            const remainingWallets = orderedWallets.slice(batchSize);

            // Update Ref for listener
            launchStateRef.current = {
                isProcessing: true,
                mode: executionMode,
                remainingWallets: remainingWallets,
                mintAddress: null,
                tokenInfo: {
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    uri: metadataUri,
                    processMode: processMode // Store for safe mode sequence
                },
                requestId: executionMode === "safe" || tokenData.launchType === "single"
                    ? `safe_launch_${Date.now()}`
                    : `launch_${Date.now()}`
            };

            // Send to server
            if (wssConnection && wssConnection.readyState === WebSocket.OPEN) {
                wssConnection.send(JSON.stringify({
                    type: 'bundle_launch_request',
                    requestId: launchStateRef.current.requestId,
                    wallets: launchWallets,
                    tokenInfo: {
                        name: tokenData.name,
                        symbol: tokenData.symbol,
                        uri: metadataUri
                    },
                    launchType: tokenData.launchType,
                    strategy: launchStrategy.toUpperCase(),
                    slippage: 1,
                    executionMode: executionMode, // Pass mode to server
                    processMode: processMode // Pass normal/mayhem
                }));

                if (executionMode === "safe" && remainingWallets.length > 0) {
                    setLaunchProgress({ percentage: 45, currentProcess: `Safe Launch: Sending initial batch (${launchWallets.length} wallets)...` });
                } else {
                    setLaunchProgress({ percentage: 80, currentProcess: "Waiting for Signatures..." });
                }
            } else {
                throw new Error("Wallet service not connected");
            }

        } catch (error: any) {
            console.error("Launch Error:", error);
            showToast(`Launch Failed: ${error.message}`);
        } finally {
            // We keep progress visible if successful, or reset if failed
            // For now, let's keep it at 40 if success (until we add next steps)
        }
    };

    return (
        <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">
            {/* Top Row - 3 Sections */}
            <div className="grid grid-cols-12 gap-3 h-[48%]">
                {/* Token Info Section - Large */}
                <div className="col-span-6 bg-gray-800/30 rounded border border-green-500/30 overflow-hidden flex flex-col">
                    {/* Header Bar */}
                    <div className="bg-green-500/10 border-b border-green-500/30 py-2 px-3">
                        <h4 className="text-green-400 font-mono text-sm text-center">Token Information</h4>
                    </div>
                    {/* Content */}
                    <div className="p-3 overflow-y-auto flex-1">

                        <div className="grid grid-cols-2 gap-3">
                            {/* Left: Form Fields */}
                            <div className="space-y-2">
                                {/* Token Name & Symbol */}
                                <div className="space-y-1">
                                    <label className="text-softYellow text-sm font-mono block">Token Details</label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        <input
                                            type="text"
                                            placeholder="Name"
                                            value={tokenData.name}
                                            onChange={(e) => setTokenData({ ...tokenData, name: e.target.value })}
                                            className="col-span-2 px-2 py-1 bg-gray-800 text-white rounded border border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Symbol"
                                            value={tokenData.symbol}
                                            onChange={(e) => setTokenData({ ...tokenData, symbol: e.target.value })}
                                            className="px-2 py-1 bg-gray-800 text-white rounded border border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="space-y-1">
                                    <label className="text-softYellow text-sm font-mono block">Description</label>
                                    <textarea
                                        placeholder="Describe your token..."
                                        value={tokenData.description}
                                        onChange={(e) => setTokenData({ ...tokenData, description: e.target.value })}
                                        className="w-full px-2 py-1 bg-gray-800 text-white rounded border border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm h-16 resize-none"
                                    />
                                </div>

                                {/* Contract Address */}
                                <div className="space-y-1">
                                    <label className="text-softYellow text-sm font-mono block">Contract Address</label>
                                    <select
                                        value={useCustomCA}
                                        onChange={(e) => setUseCustomCA(e.target.value)}
                                        className="w-full px-2 py-1 bg-gray-800 text-white rounded border border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm"
                                    >
                                        <option value="0">Generate New CA</option>
                                        <option value="1">Use Custom CA</option>
                                    </select>
                                    {useCustomCA === "1" && (
                                        <textarea
                                            placeholder="Enter Private Key (Base58)"
                                            value={customPrivateKey}
                                            onChange={(e) => setCustomPrivateKey(e.target.value)}
                                            rows={2}
                                            className="w-full px-2 py-1 bg-gray-800 text-white rounded border border-green-500/30 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm mt-1 resize-none"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Right: Image & Social */}
                            <div className="space-y-2">
                                {/* Token Image */}
                                <div className="space-y-1">
                                    <label className="text-softYellow text-sm font-mono block">Token Image</label>
                                    <label htmlFor="imageUpload" className="cursor-pointer block">
                                        <div className="w-full h-24 border border-dashed border-green-500/50 rounded hover:border-green-400 transition-colors bg-gray-800/20 flex items-center justify-center">
                                            {tokenImage ? (
                                                <div className="relative w-full h-full p-1">
                                                    <img
                                                        src={URL.createObjectURL(tokenImage)}
                                                        alt="Token"
                                                        className="w-full h-full object-contain rounded"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setTokenImage(null);
                                                        }}
                                                        className="absolute top-1 right-1 w-3 h-3 flex items-center justify-center rounded-full bg-retroRed text-white text-[8px]"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <svg className="w-6 h-6 text-green-400 mb-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                    <p className="text-green-400 text-sm font-mono mt-1">Upload</p>
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                    <input id="imageUpload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                </div>

                                {/* Social Links */}
                                <div className="space-y-1">
                                    <label className="text-softYellow text-sm font-mono block">Social Links</label>
                                    <div className="space-y-1">
                                        <input
                                            type="text"
                                            placeholder="Twitter URL"
                                            value={tokenData.twitter}
                                            onChange={(e) => setTokenData({ ...tokenData, twitter: e.target.value })}
                                            className="w-full px-2 py-1 bg-gray-800 text-white rounded border border-green-500/30 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Telegram URL"
                                            value={tokenData.telegram}
                                            onChange={(e) => setTokenData({ ...tokenData, telegram: e.target.value })}
                                            className="w-full px-2 py-1 bg-gray-800 text-white rounded border border-green-500/30 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Website URL"
                                            value={tokenData.website}
                                            onChange={(e) => setTokenData({ ...tokenData, website: e.target.value })}
                                            className="w-full px-2 py-1 bg-gray-800 text-white rounded border border-green-500/30 focus:outline-none focus:ring-1 focus:ring-green-400 font-mono text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Launch Setup - Medium */}
                <div className="col-span-3 bg-gray-800/30 rounded border border-green-500/30 overflow-hidden flex flex-col">
                    {/* Header Bar */}
                    <div className="bg-green-500/10 border-b border-green-500/30 py-2 px-3">
                        <h4 className="text-green-400 font-mono text-sm text-center">Launch Setup</h4>
                    </div>
                    {/* Content */}
                    <div className="p-2 overflow-hidden flex-1">

                        <div className="space-y-2.5">
                            {/* Platform */}
                            <div className="space-y-1">
                                <label className="text-softYellow text-xs font-mono mb-0.5 block">Platform</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        onClick={() => setTokenData({ ...tokenData, platform: "pumpfun" })}
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 ${tokenData.platform === "pumpfun"
                                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                                            : "bg-gray-800/50 text-gray-400 border-gray-600/50 hover:border-green-500/30"
                                            }`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        Pump
                                    </button>
                                    <select
                                        value={processMode}
                                        onChange={(e) => setProcessMode(e.target.value as "normal" | "mayhem")}
                                        className="px-2 py-1.5 rounded border border-green-500/50 bg-gray-800/50 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-green-400 cursor-not-allowed opacity-70"
                                        disabled
                                    >
                                        <option value="normal">Normal</option>
                                    </select>
                                </div>
                            </div>

                            {/* Launch Mode */}
                            <div className="space-y-1">
                                <label className="text-softYellow text-xs font-mono mb-0.5 block">Mode</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        onClick={() => setTokenData({ ...tokenData, launchType: "single" })}
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 ${tokenData.launchType === "single"
                                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                                            : "bg-gray-800/50 text-gray-400 border-gray-600/50 hover:border-green-500/30"
                                            }`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12 4V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M4 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                        Single
                                    </button>
                                    <button
                                        onClick={() => setTokenData({ ...tokenData, launchType: "bundle" })}
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 ${tokenData.launchType === "bundle"
                                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                                            : "bg-gray-800/50 text-gray-400 border-gray-600/50 hover:border-green-500/30"
                                            }`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" />
                                            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                                        </svg>
                                        Bundle
                                    </button>
                                </div>
                            </div>

                            {/* Strategy */}
                            <div className="space-y-1">
                                <label className="text-softYellow text-xs font-mono mb-0.5 block">Strategy</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        onClick={() => setLaunchStrategy("pentad")}
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 ${launchStrategy === "pentad"
                                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                                            : "bg-gray-800/50 text-gray-400 border-gray-600/50 hover:border-green-500/30"
                                            }`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M6 5V19M10 5V19M14 5V19M18 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M3 17L21 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
                                        </svg>
                                        Pentad
                                    </button>
                                    <button
                                        onClick={() => setLaunchStrategy("ignis")}
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 ${launchStrategy === "ignis"
                                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                                            : "bg-gray-800/50 text-gray-400 border-gray-600/50 hover:border-green-500/30"
                                            }`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16m0-1c-1.657 0-3-1-3-2.75 0-.75.25-2 1.25-3C6.125 10 7 10.5 7 10.5c-.375-1.25.5-3.25 2-3.5-.179 1-.25 2 1 3 .625.5 1 1.364 1 2.25C11 14 9.657 15 8 15" />
                                        </svg>
                                        Ignis
                                    </button>
                                    <button
                                        onClick={() => setLaunchStrategy("flash")}
                                        disabled
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 cursor-not-allowed opacity-50 bg-gray-800/50 text-gray-400 border-gray-600/50`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
                                        </svg>
                                        Flash (Soon)
                                    </button>
                                    <button
                                        onClick={() => setLaunchStrategy("echo")}
                                        disabled
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 cursor-not-allowed opacity-50 bg-gray-800/50 text-gray-400 border-gray-600/50`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" />
                                            <path d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z" stroke="currentColor" strokeWidth="1" />
                                        </svg>
                                        Echo (Soon)
                                    </button>
                                </div>
                            </div>

                            {/* Execution Mode */}
                            <div className="space-y-1">
                                <label className="text-softYellow text-xs font-mono mb-0.5 block">Execution Mode</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        onClick={() => setExecutionMode("turbo")}
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 ${executionMode === "turbo"
                                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                                            : "bg-gray-800/50 text-gray-400 border-gray-600/50 hover:border-green-500/30"
                                            }`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
                                        </svg>
                                        Turbo
                                    </button>
                                    <button
                                        onClick={() => setExecutionMode("safe")}
                                        className={`px-3 py-1.5 rounded border text-xs font-mono transition-all flex items-center justify-center gap-2 ${executionMode === "safe"
                                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                                            : "bg-gray-800/50 text-gray-400 border-gray-600/50 hover:border-green-500/30"
                                            }`}
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" />
                                            <path d="M9 11L11 13L15 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        Safe
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Progress & Summary - Medium */}
                <div className="col-span-3 bg-gray-800/30 rounded border border-green-500/30 overflow-hidden flex flex-col">
                    {/* Header Bar */}
                    <div className="bg-green-500/10 border-b border-green-500/30 py-2 px-3">
                        <h4 className="text-green-400 font-mono text-sm text-center">Progress & Summary</h4>
                    </div>
                    {/* Content */}
                    <div className="p-3 overflow-y-auto flex-1">

                        <div className="space-y-2">
                            {/* Progress Bar */}
                            <div className="space-y-1">
                                <div className="relative h-1.5 bg-gray-800/50 rounded-full overflow-hidden">
                                    <div
                                        className="absolute h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-300"
                                        style={{ width: `${launchProgress.percentage}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Status:</span>
                                    <span className={`font-mono ${launchProgress.percentage > 0
                                        ? "text-green-400"
                                        : checkLaunchRequirements() === "Ready to launch"
                                            ? "text-green-400"
                                            : "text-red-400"
                                        }`}>
                                        {launchProgress.percentage > 0 ? launchProgress.currentProcess : checkLaunchRequirements()}
                                    </span>
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="p-2 bg-gray-800/50 rounded border border-green-500/20 space-y-0.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-softYellow">Platform:</span>
                                    <span className="text-white font-mono">{tokenData.platform === "pumpfun" ? "PumpFun" : "BonkFun"}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-softYellow">Process:</span>
                                    <span className="text-white font-mono capitalize">{processMode}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-softYellow">Mode:</span>
                                    <span className="text-white font-mono capitalize">{tokenData.launchType}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-softYellow">Strategy:</span>
                                    <span className="text-white font-mono capitalize">{launchStrategy}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-softYellow">Wallets:</span>
                                    <span className="text-white font-mono">{selectedWallets.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-softYellow">Total:</span>
                                    <span className="text-white font-mono">
                                        {Object.values(walletAmounts).reduce((sum, amt) => sum + (parseFloat(amt) || 0), 0).toFixed(2)} SOL
                                    </span>
                                </div>
                            </div>

                            {/* Launch Button */}
                            <button
                                onClick={handleLaunch}
                                disabled={isLaunchInProgress || checkLaunchRequirements() !== "Ready to launch"}
                                className={`w-full py-2 rounded font-mono text-sm font-bold transition-all flex items-center justify-center gap-2 ${checkLaunchRequirements() === "Ready to launch" && !isLaunchInProgress
                                    ? "bg-green-500 text-black hover:bg-green-400"
                                    : "bg-gray-800 text-gray-500 cursor-not-allowed"
                                    }`}
                            >
                                {isLaunchInProgress ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Launching...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M13.13 22.19L11.5 18.33C11.16 17.51 11.2 16.57 11.61 15.79L12.56 14C12.89 13.36 13.56 12.96 14.28 12.96H16.5C18.43 12.96 20 11.39 20 9.46V7.17C20 6.62 20.45 6.17 21 6.17C21.55 6.17 22 6.62 22 7.17V9.46C22 12.5 19.54 14.96 16.5 14.96H14.28L13.33 16.75L15 20.71L13.13 22.19ZM5 12C3.34 12 2 10.66 2 9C2 7.34 3.34 6 5 6C6.66 6 8 7.34 8 9C8 10.66 6.66 12 5 12ZM5 10C5.55 10 6 9.55 6 9C6 8.45 5.55 8 5 8C4.45 8 4 8.45 4 9C4 9.55 4.45 10 5 10ZM17 4C15.9 4 15 3.1 15 2C15 0.9 15.9 0 17 0C18.1 0 19 0.9 19 2C19 3.1 18.1 4 17 4ZM17 3C17.55 3 18 2.55 18 2C18 1.45 17.55 1 17 1C16.45 1 16 1.45 16 2C16 2.55 16.45 3 17 3Z" fill="currentColor" />
                                            <path d="M12 2L2 22L12 18L22 22L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        Launch Token
                                    </>
                                )}
                            </button>

                            {!isLaunchInProgress && (
                                <button
                                    onClick={() => {
                                        setTokenData({
                                            name: "",
                                            symbol: "",
                                            description: "",
                                            twitter: "",
                                            telegram: "",
                                            website: "",
                                            platform: "pumpfun",
                                            launchType: "single",
                                        });
                                        setProcessMode("normal");
                                        setTokenImage(null);
                                        setSelectedWallets([]);
                                        setWalletRoles({});
                                        setWalletAmounts({});
                                        setDevWalletIndex(null);
                                        setLaunchProgress({ percentage: 0, currentProcess: "" });
                                    }}
                                    className="w-full py-1.5 rounded border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors font-mono text-sm"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row - 2 Sections */}
            <div className="grid grid-cols-12 gap-3 h-[50%]">
                {/* Multi-Tab Wallet Section - Large */}
                <div className="col-span-8 bg-gray-800/30 rounded border border-green-500/30 flex flex-col overflow-hidden">
                    {/* Tab Headers */}
                    <div className="flex border-b border-green-500/30 flex-shrink-0">
                        <button
                            onClick={() => setActiveTab("wallets")}
                            className={`px-3 py-1.5 text-xs font-mono transition-all ${activeTab === "wallets"
                                ? "bg-gray-700/50 text-green-400 border-b-2 border-green-400"
                                : "text-gray-400 hover:text-green-400"
                                }`}
                        >
                            WALLETS
                            {walletConnectionStatus !== 'connected' && (
                                <span className={`ml-2 text-[10px] font-mono ${walletConnectionStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400'} animate-pulse`}>
                                    {walletConnectionStatus === 'connecting' ? '● CONN' : '● OFF'}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab("participants")}
                            className={`px-3 py-1.5 text-xs font-mono transition-all ${activeTab === "participants"
                                ? "bg-gray-700/50 text-green-400 border-b-2 border-green-400"
                                : "text-gray-400 hover:text-green-400"
                                }`}
                        >
                            PARTICIPANTS ({selectedWallets.length})
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="p-3 flex-1 overflow-y-auto">
                        {activeTab === "wallets" ? (
                            connectedWallets.length > 0 ? (
                                <div className="grid grid-cols-5 gap-2">
                                    {connectedWallets.map((wallet) => (
                                        <button
                                            key={wallet.id}
                                            onClick={() => handleWalletSelect(wallet.id)}
                                            className={`relative p-2 rounded border text-left transition-all ${selectedWallets.includes(wallet.id)
                                                ? "bg-green-500/20 border-green-400"
                                                : "bg-gray-800 border-gray-700 hover:border-gray-500"
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-[10px] font-mono px-1 rounded ${getWalletRole(wallet.id) === "dev"
                                                    ? "bg-green-500 text-black font-bold"
                                                    : "bg-gray-700 text-gray-400"
                                                    }`}>
                                                    {getWalletRole(wallet.id) === "dev" ? "DEV" : "PAR"}
                                                </span>
                                                {selectedWallets.includes(wallet.id) && (
                                                    <span className="text-green-400 text-xs">✓</span>
                                                )}
                                            </div>
                                            <div className="font-mono text-xs text-white truncate my-1">
                                                {shortenAddress(wallet.publicKey)}
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <span className="text-[10px] text-gray-400">SOL:</span>
                                                <span className="text-[10px] text-green-300 font-mono">{(wallet.solBalance || 0).toFixed(2)}</span>
                                            </div>
                                            {getWalletAmount(wallet.id) && (
                                                <div className="mt-1 pt-1 border-t border-gray-600/50 flex justify-between items-center text-[10px]">
                                                    <span className="text-softYellow">Buy:</span>
                                                    <span className="text-white font-mono">{getWalletAmount(wallet.id)}</span>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 font-mono text-sm py-10">
                                    {walletConnectionStatus === 'connecting' ? (
                                        <>
                                            <span className="animate-pulse">Connecting to wallet service...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-red-500/50 mx-auto mb-2" stroke="currentColor" strokeWidth="2">
                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                                                <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" strokeLinejoin="round" />
                                                <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            <span>No wallets connected</span>
                                            <span className="text-xs mt-1 text-gray-600">Please Start Wallet Client</span>
                                        </>
                                    )}
                                </div>
                            )
                        ) : (
                            <>
                                {selectedWallets.length === 0 ? (
                                    <div className="text-center py-16 text-gray-400">
                                        <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-gray-500 mx-auto mb-1" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                                            <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <p className="text-xs mt-2">No participants selected</p>
                                        <p className="text-[10px] mt-1">Select wallets from the WALLETS tab</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-5 gap-2">
                                        {selectedWallets.map((walletId) => {
                                            const wallet = connectedWallets.find((w) => w.id === walletId);
                                            if (!wallet) return null;
                                            const role = getWalletRole(walletId);
                                            const isDev = role === "dev";
                                            const amount = getWalletAmount(walletId);
                                            const index = connectedWallets.indexOf(wallet);

                                            return (
                                                <div
                                                    key={walletId}
                                                    className={`p-2 rounded border ${isDev ? "bg-green-900/20 border-green-500/50" : "bg-gray-800/50 border-gray-600/30"
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`font-bold text-sm ${isDev ? "text-green-400" : "text-gray-400"}`}>
                                                                #{index + 1}
                                                            </span>
                                                            {isDev ? (
                                                                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-green-400" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" strokeLinecap="round" strokeLinejoin="round" />
                                                                </svg>
                                                            ) : (
                                                                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-gray-500" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                                                                    <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => handleWalletSelect(walletId)}
                                                            className="text-retroRed hover:text-retroRed/80 text-sm leading-none"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>

                                                    <div className="mb-1">
                                                        <div className="text-xs text-gray-400 font-mono truncate">{shortenAddress(wallet.publicKey)}</div>
                                                        <div className="text-xs text-softYellow font-mono">{(wallet.solBalance || 0).toFixed(2)} SOL</div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-1">
                                                        <select
                                                            value={role}
                                                            onChange={(e) => handleWalletRoleChange(walletId, e.target.value)}
                                                            className={`px-1 py-0.5 text-[10px] rounded border font-mono ${isDev
                                                                ? "bg-green-900/30 text-green-300 border-green-500/50"
                                                                : "bg-gray-800 text-white border-gray-600/50"
                                                                } focus:outline-none appearance-none cursor-pointer text-center`}
                                                        >
                                                            <option value="participant">PAR</option>
                                                            <option value="dev">DEV</option>
                                                        </select>

                                                        <input
                                                            type="text"
                                                            placeholder="0.0"
                                                            value={amount}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                if (value === "" || (!isNaN(Number(value)) && parseFloat(value) >= 0)) {
                                                                    handleWalletAmountChange(walletId, value);
                                                                }
                                                            }}
                                                            className={`px-1 py-0.5 text-[10px] rounded border font-mono ${isDev
                                                                ? "bg-green-900/30 text-green-300 border-green-500/50"
                                                                : "bg-gray-800 text-white border-gray-600/50"
                                                                } focus:outline-none`}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Amount Setup - Medium */}
                <div className="col-span-4 bg-gray-800/30 rounded border border-green-500/30 overflow-hidden flex flex-col">
                    {/* Header Bar */}
                    <div className="bg-green-500/10 border-b border-green-500/30 py-2 px-3">
                        <h4 className="text-green-400 font-mono text-sm text-center">Amount Setup</h4>
                    </div>
                    {/* Content */}
                    <div className="p-3 overflow-y-auto flex-1">

                        <div className="space-y-4">
                            {/* Amount Input */}
                            <div className="space-y-2">
                                <div>
                                    <label className="block text-softYellow font-mono text-xs font-medium mb-1">Buy Amounts (SOL)</label>
                                    <input
                                        type="text"
                                        value={amountInput}
                                        onChange={(e) => handleMainAmountChange(e.target.value)}
                                        placeholder="0.1 or 0.1,0.2,0.3"
                                        className="w-full rounded border border-green-500/30 bg-gray-800/50 px-3 py-1.5 text-white placeholder:text-gray-500 focus:outline-none focus:border-green-400 text-xs font-mono"
                                    />
                                    <div className="text-gray-500 text-[10px] font-mono mt-1">
                                        Single amount for all, or comma-separated for individual
                                    </div>
                                </div>
                            </div>

                            {/* Settings */}
                            <div className="space-y-3">

                                <div className="space-y-2">
                                    {/* Randomization Controls */}
                                    <div className="space-y-2">
                                        <div className="space-y-2">
                                            <label className="block text-softYellow font-mono text-xs font-medium">Random Amounts</label>
                                            <div className="flex items-end gap-2">
                                                <div className="flex-1">
                                                    <label className="block text-gray-400 font-mono text-[10px] mb-1">Min %</label>
                                                    <input
                                                        type="number"
                                                        value={minPercentage}
                                                        onChange={(e) => setMinPercentage(Math.max(1, Math.min(100, parseInt(e.target.value) || 20)))}
                                                        className="w-full rounded border border-green-500/30 bg-gray-800/50 px-2 py-1.5 text-white focus:outline-none focus:border-green-400 text-xs font-mono"
                                                        min="1"
                                                        max="100"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-gray-400 font-mono text-[10px] mb-1">Max %</label>
                                                    <input
                                                        type="number"
                                                        value={randomPercentage}
                                                        onChange={(e) => setRandomPercentage(Math.max(1, Math.min(100, parseInt(e.target.value) || 60)))}
                                                        className="w-full rounded border border-green-500/30 bg-gray-800/50 px-2 py-1.5 text-white focus:outline-none focus:border-green-400 text-xs font-mono"
                                                        min="1"
                                                        max="100"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newAmounts: Record<string, string> = {};
                                                        selectedWallets.forEach(walletId => {
                                                            newAmounts[walletId] = calculateRandomizedAmount(walletId);
                                                        });
                                                        setWalletAmounts(newAmounts);

                                                        // Update main input to show all calculated amounts
                                                        const amountsArray = selectedWallets.map(walletId => newAmounts[walletId] || '');
                                                        handleMainAmountChange(amountsArray.join(','));
                                                    }}
                                                    className="px-3 py-1.5 rounded border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-mono transition-colors whitespace-nowrap mb-[1px]"
                                                >
                                                    🎲 Randomize
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="checkbox"
                                                id="useTargetAmount"
                                                checked={useTargetAmount}
                                                onChange={(e) => setUseTargetAmount(e.target.checked)}
                                                className="rounded border border-green-500/30 bg-gray-800/50 text-green-400 focus:outline-none focus:border-green-400"
                                            />
                                            <label htmlFor="useTargetAmount" className="text-softYellow font-mono text-xs">Use proportional target amount</label>
                                        </div>

                                        {useTargetAmount && (
                                            <div className="flex items-center gap-2 pl-5">
                                                <label className="text-gray-400 font-mono text-xs whitespace-nowrap">Target</label>
                                                <input
                                                    type="text"
                                                    value={targetAmount}
                                                    onChange={(e) => setTargetAmount(e.target.value)}
                                                    placeholder="5.0"
                                                    className="w-20 rounded border border-green-500/30 bg-gray-800/50 px-2 py-1 text-white placeholder:text-gray-500 focus:outline-none focus:border-green-400 text-xs font-mono"
                                                />
                                                <span className="text-gray-400 font-mono text-xs">SOL</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Utility Buttons */}
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-green-500/20">
                                <button
                                    onClick={() => setIsDistributeModalOpen(true)}
                                    className="px-3 py-2 rounded border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-purple-400 group-hover:text-purple-300">
                                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                                        <path d="M12 9V3M12 21v-6M9 12H3M21 12h-6M15.5 8.5l4-4M15.5 15.5l4 4M8.5 8.5l-4-4M8.5 15.5l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                    <span className="text-xs font-mono font-medium">Distribute SOL</span>
                                </button>

                                <div className="relative">
                                    <button
                                        disabled
                                        className="w-full px-3 py-2 rounded border border-orange-500/10 bg-orange-500/5 text-orange-300/40 cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-orange-400/40">
                                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span className="text-xs font-mono font-medium">Warm Up</span>
                                    </button>
                                    <div className="absolute -top-1.5 -right-1 px-1.5 py-0.5 bg-orange-500/20 border border-orange-500/30 rounded-sm text-[8px] text-orange-400 font-bold tracking-wider pointer-events-none uppercase">
                                        Soon
                                    </div>
                                </div>
                            </div>


                        </div>
                    </div>
                </div>
            </div>

            {/* Distribute SOL Modal */}
            <DistributeSolModal
                isOpen={isDistributeModalOpen}
                onClose={() => setIsDistributeModalOpen(false)}
                selectedWallets={selectedWallets}
                connectedWallets={connectedWallets}
                wssConnection={wssConnection}
                onToast={showToast}
                positionIndex={4}
            />

            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2 bg-gray-900/90 border border-green-500/30 rounded shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-green-400 font-mono text-xs whitespace-nowrap" dangerouslySetInnerHTML={{ __html: toastMessage || "" }} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaunchpadPage;
