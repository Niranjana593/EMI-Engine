import React, { useState, useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';

// Global constants
// const API_KEY = "AIzaSyD6NCw8ey1XS-mN7WedAez3GDPx4U7HJDw"; 
const API_KEY=import.meta.env.VITE_GEMINI_API_KEY;
const API_URL=`${import.meta.env.VITE_GEMINI_URL}?key=${API_KEY}`;
// const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;

// Icon components (using inline SVG for simplicity)
const SendIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-send"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>);
const MessageIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-message-circle"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>);
const CloseIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-x"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);

// Helper function to format currency
const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Core function to calculate EMI and generate amortization schedule.
 * @param {number} P - Principal amount
 * @param {number} R_annual - Annual interest rate (%)
 * @param {number} N_years - Loan tenure (years)
 */
const calculateLoan = (P, R_annual, N_years) => {
    if (P <= 0 || R_annual < 0 || N_years <= 0) return null;

    const R = R_annual / (12 * 100); // Monthly interest rate
    const N = N_years * 12; // Total months

    let calculatedEmi;
    if (R === 0) {
        calculatedEmi = P / N;
    } else {
        calculatedEmi = P * R * Math.pow(1 + R, N) / (Math.pow(1 + R, N) - 1);
    }

    const totalPayment = calculatedEmi * N;
    const totalInterest = totalPayment - P;

    // --- Generate Amortization Schedule ---
    let balance = P;
    const schedule = [];
    for (let month = 1; month <= N; month++) {
        const interestPayment = balance * R;
        let principalPayment = calculatedEmi - interestPayment;
        
        // Final month adjustment for rounding errors
        if (month === N) {
            principalPayment = balance;
        }

        balance -= principalPayment;

        schedule.push({
            month: month,
            payment: calculatedEmi,
            principal: principalPayment,
            interest: interestPayment,
            balance: balance > 0 ? balance : 0,
        });
    }

    return {
        emi: calculatedEmi,
        totalInterest: totalInterest,
        totalPayment: totalPayment,
        schedule: schedule,
    };
};

// Component for Loan Input Fields
const LoanInputs = ({ amount, setAmount, rate, setRate, tenure, setTenure }) => (
    <div className="space-y-4">
        <div>
            <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700 mb-1">Loan Amount (₹)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g., 500000" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
        </div>
        <div>
            <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700 mb-1">Annual Interest Rate (%)</label>
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g., 8.5" step="0.01" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
        </div>
        <div>
            <label htmlFor="loanTenure" className="block text-sm font-medium text-gray-700 mb-1">Loan Tenure (Years)</label>
            <input type="number" value={tenure} onChange={(e) => setTenure(e.target.value)} placeholder="e.g., 20" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors" />
        </div>
    </div>
);

// Main Application Component
function App() {
    // --- State for Loan 1 (Main Calculator) ---
    const [amount1, setAmount1] = useState('');
    const [rate1, setRate1] = useState('');
    const [tenure1, setTenure1] = useState('');
    const [loan1Result, setLoan1Result] = useState(null);

    // --- State for Loan 2 (Comparison) ---
    const [amount2, setAmount2] = useState('');
    const [rate2, setRate2] = useState('');
    const [tenure2, setTenure2] = useState('');
    const [loan2Result, setLoan2Result] = useState(null);

    const [message, setMessage] = useState({ text: '', type: '' });
    const [currentTab, setCurrentTab] = useState('calculator'); // 'calculator' or 'comparison'

    // --- Chatbot States ---
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState([{ sender: 'bot', text: "Hello! I'm here to help you understand your EMI calculation. Ask me about your loan results or general finance concepts!" }]);
    const [isTyping, setIsTyping] = useState(false);
    
    // Chart Refs
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const chatMessagesRef = useRef(null);

    // --- Calculation Handlers ---

    const validateInputs = (P, R, N) => {
        if (isNaN(P) || P <= 0 || isNaN(R) || R < 0 || isNaN(N) || N <= 0) {
            return false;
        }
        return true;
    };

    const handleLoan1Calculation = useCallback(() => {
        setMessage({ text: '', type: '' });
        const P = parseFloat(amount1);
        const R = parseFloat(rate1);
        const N = parseFloat(tenure1);

        if (!validateInputs(P, R, N)) {
            setLoan1Result(null);
            setMessage({ text: 'Please enter valid positive numbers for all fields.', type: 'error' });
            return;
        }

        const result = calculateLoan(P, R, N);
        setLoan1Result(result);
    }, [amount1, rate1, tenure1]);

    const handleComparisonCalculation = useCallback(() => {
        setMessage({ text: '', type: '' });
        const P1 = parseFloat(amount1);
        const R1 = parseFloat(rate1);
        const N1 = parseFloat(tenure1);
        const P2 = parseFloat(amount2);
        const R2 = parseFloat(rate2);
        const N2 = parseFloat(tenure2);
        
        const valid1 = validateInputs(P1, R1, N1);
        const valid2 = validateInputs(P2, R2, N2);

        if (!valid1 && !valid2) {
            setLoan1Result(null);
            setLoan2Result(null);
            setMessage({ text: 'Please enter valid numbers for at least one loan scenario.', type: 'error' });
            return;
        }

        setLoan1Result(valid1 ? calculateLoan(P1, R1, N1) : null);
        setLoan2Result(valid2 ? calculateLoan(P2, R2, N2) : null);

        if (valid1 && valid2) {
            setMessage({ text: 'Comparison calculated successfully.', type: 'success' });
        } else if (valid1) {
             setMessage({ text: 'Comparison calculated for Loan 1 only.', type: 'success' });
        } else if (valid2) {
            setMessage({ text: 'Comparison calculated for Loan 2 only.', type: 'success' });
        }
    }, [amount1, rate1, tenure1, amount2, rate2, tenure2]);


    // --- Effect for Chart.js rendering (Loan 1) ---
    useEffect(() => {
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
        }

        if (loan1Result && chartRef.current) {
            const P = parseFloat(amount1);

            chartInstanceRef.current = new Chart(chartRef.current, {
                type: 'doughnut',
                data: {
                    labels: ['Principal Amount', 'Total Interest'],
                    datasets: [{
                        data: [P, loan1Result.totalInterest],
                        backgroundColor: [
                            'rgb(59, 130, 246)', // Blue
                            'rgb(34, 197, 94)'  // Green
                        ],
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: function(tooltipItem) {
                                    const value = tooltipItem.raw;
                                    const sum = tooltipItem.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / sum) * 100).toFixed(2);
                                    return ` ${tooltipItem.label}: ${formatCurrency(value)} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
            }
        };
    }, [loan1Result, amount1]);

    // --- Chatbot Logic ---
    useEffect(() => {
        if (chatMessagesRef.current) {
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
    }, [chatHistory, isTyping]);


    const sendMessage = async () => {
        const userMessage = chatInput.trim();
        if (!userMessage) return;

        setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }]);
        setChatInput('');
        setIsTyping(true);

        // Prepare context based on current results
        let loanDetails = [];
        if (loan1Result) {
            loanDetails.push(`Loan 1: Principal ₹${amount1}, Rate ${rate1}%, Tenure ${tenure1} years. EMI: ${formatCurrency(loan1Result.emi)}, Total Interest: ${formatCurrency(loan1Result.totalInterest)}.`);
        }
        if (loan2Result) {
            loanDetails.push(`Loan 2: Principal ₹${amount2}, Rate ${rate2}%, Tenure ${tenure2} years. EMI: ${formatCurrency(loan2Result.emi)}, Total Interest: ${formatCurrency(loan2Result.totalInterest)}.`);
        }
        const currentLoanDetails = loanDetails.length > 0 ? loanDetails.join(' ') : 'No loan calculated yet.';

        const prompt = `You are a helpful financial assistant specializing in EMI and loan concepts. Explain financial concepts clearly, concisely, and in a friendly manner.
        The user is currently using an EMI calculator. Here are their current calculation details: ${currentLoanDetails}
        User's Question: ${userMessage}`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not process that request right now. Please try again.';

            setChatHistory(prev => [...prev, { sender: 'bot', text: aiResponse }]);

        } catch (error) {
            console.error('API Error:', error);
            setChatHistory(prev => [...prev, { sender: 'bot', text: 'Oops! I encountered an error during the API call. Please check the console for details and try again later.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // Determine message box style
    const messageClass = message.type === 'error' 
        ? 'bg-red-100 text-red-700' 
        : 'bg-green-100 text-green-700';

    // --- JSX Rendering Helpers ---

    const LoanSummaryCard = ({ label, value, color }) => (
        <div className={`p-4 ${color} rounded-lg shadow-sm text-center`}>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold mt-1 text-gray-800">{formatCurrency(value)}</p>
        </div>
    );

    const ComparisonResults = () => {
        const resultsReady = loan1Result || loan2Result;
        
        if (!resultsReady) {
            return <p className="text-center text-gray-500 mt-8">Enter details and click 'Compare' to see results.</p>;
        }

        const data = [
            { label: 'Monthly EMI', key: 'emi' },
            { label: 'Total Interest', key: 'totalInterest' },
            { label: 'Total Payment', key: 'totalPayment' },
        ];

        return (
            <div className="mt-8 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 shadow-lg rounded-xl overflow-hidden">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-blue-500 uppercase tracking-wider">Loan 1</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-purple-500 uppercase tracking-wider">Loan 2</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.map(({ label, key }) => (
                            <tr key={key} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{label}</td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm text-center ${loan1Result ? 'font-semibold text-blue-700' : 'text-gray-400'}`}>
                                    {loan1Result ? formatCurrency(loan1Result[key]) : 'N/A'}
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm text-center ${loan2Result ? 'font-semibold text-purple-700' : 'text-gray-400'}`}>
                                    {loan2Result ? formatCurrency(loan2Result[key]) : 'N/A'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const AmortizationSchedule = () => {
        if (!loan1Result || loan1Result.schedule.length === 0) return null;

        return (
            <div className="mt-12">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Amortization Schedule (Loan 1)</h3>
                <div className="max-h-96 overflow-y-auto rounded-lg shadow-md border print-schedule-fix">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {['Month', 'Payment (₹)', 'Principal (₹)', 'Interest (₹)', 'Balance (₹)'].map(header => (
                                    <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {loan1Result.schedule.map((item) => (
                                <tr key={item.month} className="hover:bg-blue-50">
                                    <td className="px-4 py-2 whitespace-nowrap">{item.month}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(item.payment)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-green-700">{formatCurrency(item.principal)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-red-700">{formatCurrency(item.interest)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-medium">{formatCurrency(item.balance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">Note: Totals may vary slightly due to final payment adjustments for rounding.</p>
            </div>
        );
    };


    return (
        <div className="flex w-[100vw] x flex-col items-center justify-center min-h-screen  md:p-8 bg-gray-100">
            {/* INLINE CSS FOR PRINT OPTIMIZATION */}
            <style jsx="true">
                {`
                    @media print {
                        /* Hide everything unnecessary for print */
                        .print-hide, #chatContainer {
                            display: none !important;
                        }
                        /* Ensure the main content uses full width and no background/shadows */
                        .print-area {
                            width: 100% !important;
                            max-width: none !important;
                            margin: 0 !important;
                            box-shadow: none !important;
                            padding: 0 !important;
                            background-color: white !important;
                        }
                        /* Remove fixed height and scroll for schedule */
                        .print-schedule-fix {
                            max-height: none !important;
                            overflow: visible !important;
                        }
                        /* Force chart to be wider for print clarity */
                        .chart-container {
                            width: 70% !important; 
                            margin: 0 auto !important;
                        }
                        /* Ensure the main grid flows correctly */
                        .lg\\:flex-row {
                            flex-direction: column !important;
                        }
                        .lg\\:w-2\\/3 {
                            width: 100% !important;
                        }
                    }
                `}
            </style>

            <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-4xl transition-all duration-300 transform hover:shadow-xl print-area">
                <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">Advanced EMI Calculator</h1>
                
                {/* Tab Navigation (print-hide) */}
                <div className="flex border-b gap-10   border-gray-200 mb-6 print-hide">
                    <button onClick={() => setCurrentTab('calculator')} className={`py-2 px-4 font-semibold ${currentTab === 'calculator' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-blue-600'}`}>
                        Loan Calculator
                    </button>
                    <button onClick={() => setCurrentTab('comparison')} className={`py-2 px-4 font-semibold ${currentTab === 'comparison' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-500 hover:text-purple-600'}`}>
                        Loan Comparison
                    </button>
                </div>

                {/* Main Content: Calculator Tab */}
                {currentTab === 'calculator' && (
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Input Form (Loan 1) - print-hide */}
                        <div className="w-full lg:w-1/3 space-y-6 print-hide">
                            <h2 className="text-xl font-semibold text-gray-700 mb-2">Loan Details</h2>
                            <LoanInputs 
                                amount={amount1} setAmount={setAmount1}
                                rate={rate1} setRate={setRate1}
                                tenure={tenure1} setTenure={setTenure1}
                            />
                            <button onClick={handleLoan1Calculation} className="w-full bg-blue-600 text-black font-semibold py-3 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200">
                                Calculate Loan
                            </button>
                        </div>

                        {/* Result Display & Chart (print-friendly) */}
                        <div className={`w-full lg:w-2/3 mt-8 lg:mt-0 ${loan1Result ? '' : 'flex items-center justify-center'}`}>
                            {loan1Result ? (
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h2 className="text-xl font-bold text-gray-800">Calculation Summary</h2>
                                        {/* Print Button (print-hide) */}
                                        <button 
                                            onClick={handlePrint}
                                            className="print-hide bg-gray-500 text-black font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-gray-600 transition-colors duration-200 text-sm flex items-center"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                            Print/Save as PDF
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                        <LoanSummaryCard label="Monthly EMI" value={loan1Result.emi} color="bg-blue-50" />
                                        <LoanSummaryCard label="Total Interest" value={loan1Result.totalInterest} color="bg-green-50" />
                                        <LoanSummaryCard label="Total Payment" value={loan1Result.totalPayment} color="bg-purple-50" />
                                    </div>
                                    <div className="w-full max-w-sm mx-auto chart-container">
                                        <h3 className="text-lg font-semibold text-center mb-4">Payment Breakdown</h3>
                                        <canvas ref={chartRef}></canvas>
                                    </div>
                                    <AmortizationSchedule />
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center lg:pt-24 print-hide">Enter loan details to see the summary and amortization schedule.</p>
                            )}
                        </div>
                    </div>
                )}
                
                {/* Main Content: Comparison Tab (print-hide) */}
                {currentTab === 'comparison' && (
                    <div className="space-y-8 print-hide">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="w-full md:w-1/2 p-4 border border-blue-200 rounded-lg">
                                <h2 className="text-lg font-bold text-blue-700 mb-4">Loan 1 Details</h2>
                                <LoanInputs 
                                    amount={amount1} setAmount={setAmount1}
                                    rate={rate1} setRate={setRate1}
                                    tenure={tenure1} setTenure={setTenure1}
                                />
                            </div>
                            <div className="w-full md:w-1/2 p-4 border border-purple-200 rounded-lg">
                                <h2 className="text-lg font-bold text-purple-700 mb-4">Loan 2 Details</h2>
                                <LoanInputs 
                                    amount={amount2} setAmount={setAmount2}
                                    rate={rate2} setRate={setRate2}
                                    tenure={tenure2} setTenure={setTenure2}
                                />
                            </div>
                        </div>
                        <button onClick={handleComparisonCalculation} className="w-full bg-indigo-600 text-black font-semibold py-3 rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200">
                            Compare Loans
                        </button>
                        <ComparisonResults />
                    </div>
                )}

                {/* Error/Message Box (print-hide) */}
                {message.text && (
                    <div className={`mt-6 p-4 text-sm text-center rounded-lg ${messageClass} print-hide`}>
                        {message.text}
                    </div>
                )}
            </div>
            
            {/* Chatbot Container (Fixed position) - print-hide */}
            <div id="chatContainer" className="fixed bottom-4 right-4 z-50 print-hide">
                <button onClick={() => setIsChatOpen(!isChatOpen)} className="bg-blue-600 text-black rounded-full p-4 shadow-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform duration-200 transform hover:scale-110">
                    <MessageIcon />
                </button>

                <div id="chatWindow" className={`absolute bottom-0 right-0 ${isChatOpen ? 'block' : 'hidden'} bg-white rounded-xl shadow-2xl w-80 h-96 flex flex-col p-4 mb-16 transition-all duration-300`}>
                    <div className="flex justify-between items-center pb-2 border-b border-gray-200 mb-2">
                        <h3 className="font-bold text-lg text-gray-800">Finance Chatbot</h3>
                        <button onClick={() => setIsChatOpen(false)} className="text-gray-500 hover:text-gray-700">
                            <CloseIcon />
                        </button>
                    </div>
                    
                    <div ref={chatMessagesRef} id="chatMessages" className="flex-1 overflow-y-auto mb-4 space-y-3">
                        {chatHistory.map((msg, index) => (
                            <div key={index} className={`max-w-[85%] p-3 rounded-xl shadow-sm text-sm ${msg.sender === 'user' ? 'bg-blue-50 text-right ml-auto' : 'bg-gray-100 text-left mr-auto'}`}>
                                {msg.text}
                            </div>
                        ))}
                        {isTyping && (
                            <div className="max-w-[85%] p-3 bg-gray-100 rounded-xl shadow-sm text-left mr-auto text-sm italic text-gray-500 animate-pulse">
                                Chatbot is typing...
                            </div>
                        )}
                    </div>

                    <div className="flex">
                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={handleKeyPress} placeholder="Ask about EMI..." className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button onClick={sendMessage} className="ml-2 bg-blue-600 text-black rounded-lg p-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <SendIcon />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;