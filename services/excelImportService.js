const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const DefaulterReport = require('../models/DefaulterReport');

const FILE_PATH = path.join(__dirname, '..', 'Company And Defaulter Data On 15.08.2026.xlsx');

const clean = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '' || s.toUpperCase() === 'NULL') return null;
    return s;
};

// Address strings look like: "..., <City>, Tal - <Taluka>, Dist - <District>, <State>,..."
const parseAddressParts = (fullAddress) => {
    const result = { state: null, district: null, subDistrict: null, city: null };
    if (!fullAddress) return result;
    const m = fullAddress.match(/,\s*([^,]+?)\s*,\s*Tal\s*-\s*([^,]+?)\s*,\s*Dist\s*-\s*([^,]+?)\s*,\s*([^,]+?)\s*,/i);
    if (m) {
        result.city = m[1].trim();
        result.subDistrict = m[2].trim();
        result.district = m[3].trim();
        result.state = m[4].trim();
    }
    return result;
};

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 40);

const companyKey = (name, gst) => `${(name || '').trim().toUpperCase()}|${(gst || '').trim().toUpperCase()}`;
const defaulterKey = (userId, name, gst, pan, amount) =>
    `${userId}|${(name || '').trim().toUpperCase()}|${(gst || '').trim().toUpperCase()}|${(pan || '').trim().toUpperCase()}|${amount}`;

async function runImport() {
    const wb = XLSX.readFile(FILE_PATH);
    const companyRows = XLSX.utils.sheet_to_json(wb.Sheets['Companies'], { defval: null });
    const defaulterRows = XLSX.utils.sheet_to_json(wb.Sheets['Defaulters'], { defval: null });

    const existingUsers = await User.find({}, 'email phone companyName gst memberId').lean();
    const usedEmails = new Set(existingUsers.map(u => (u.email || '').toLowerCase()));
    const usedPhones = new Set(existingUsers.map(u => u.phone));

    // normalized (companyName|gst) -> existing user _id, for idempotent re-runs
    const existingCompanyByKey = new Map();
    // normalized companyName only -> existing user _id (fallback match when gst is blank on one side)
    const existingCompanyByName = new Map();
    for (const u of existingUsers) {
        if (!u.companyName) continue;
        existingCompanyByKey.set(companyKey(u.companyName, u.gst), u._id);
        const nameOnly = (u.companyName || '').trim().toUpperCase();
        if (!existingCompanyByName.has(nameOnly)) existingCompanyByName.set(nameOnly, u._id);
    }

    let memberSeq = await User.countDocuments();
    const nameToCompanyId = new Map(); // normalized COMPANYNAME -> resolved Mongo _id (new or existing)
    const newCompanyDocs = [];
    let companiesSkipped = 0;

    for (const row of companyRows) {
        const companyName = clean(row.COMPANYNAME) || `Unknown Company ${row.SrNo}`;
        const normName = companyName.trim().toUpperCase();
        const gst = clean(row.GSTNO) || '';

        const existingId = existingCompanyByKey.get(companyKey(companyName, gst)) || existingCompanyByName.get(normName);
        if (existingId) {
            nameToCompanyId.set(normName, existingId);
            companiesSkipped++;
            continue;
        }

        let email = clean(row.AUTORISEEMAIL);
        if (email) email = email.toLowerCase();
        if (!email || usedEmails.has(email)) {
            email = `${slugify(companyName) || 'company'}.${row.SrNo}@caip-import.local`;
        }
        usedEmails.add(email);

        let phone = clean(row.AUTHORISEMOBILENO);
        if (phone) phone = phone.replace(/\D/g, '');
        if (!phone || phone.length < 10 || usedPhones.has(phone)) {
            phone = `0${String(row.SrNo).padStart(9, '0')}`;
        }
        usedPhones.add(phone);

        const businessAddress = clean(row.COMPANYADDRESS) || clean(row.FULL_ADDRESS) || 'N/A';
        const state = clean(row.STATENAME) || 'N/A';
        const district = clean(row.DISTRICTNAME) || 'N/A';
        const subDistrict = clean(row.TALUKANAME) || 'N/A';
        const city = clean(row.CITYNAME);

        memberSeq++;
        const memberId = `CAIP${String(memberSeq).padStart(5, '0')}`;
        const passwordPlain = clean(row.PWD) || Math.random().toString(36).slice(-8);

        const _id = new mongoose.Types.ObjectId();
        const doc = {
            _id,
            name: clean(row.AUTHORISEPERSON) || companyName,
            email,
            password: passwordPlain,
            phone,
            state,
            district,
            subDistrict,
            city: city || '',
            businessAddress,
            gst,
            pinCode: clean(row.PINCODE) || '',
            companyName,
            companyEmail: clean(row.AUTORISEEMAIL) || '',
            companyPhoneNumber: clean(row.CONTACTNO) || '',
            role: '2',
            status: '1',
            membership_status: '1',
            membershipExpiry: 'Lifetime',
            memberId,
            businessType: '',
            yearsInBusiness: '',
            cinNumber: '',
            industry: ''
        };

        newCompanyDocs.push(doc);
        nameToCompanyId.set(normName, _id);
    }

    for (const doc of newCompanyDocs) {
        doc.password = await bcrypt.hash(doc.password, 10);
    }
    if (newCompanyDocs.length > 0) {
        await User.insertMany(newCompanyDocs, { ordered: false });
    }

    const existingDefaulterKeys = new Set(
        (await DefaulterReport.find({}, 'user_id defaulter_name gst_number pan_number default_amount').lean())
            .map(d => defaulterKey(d.user_id, d.defaulter_name, d.gst_number, d.pan_number, d.default_amount))
    );

    const newDefaulterDocs = [];
    let defaultersSkipped = 0;
    let defaultersUnmatched = 0;

    for (const row of defaulterRows) {
        const companyName = clean(row.COMPANYNAME);
        const normName = companyName ? companyName.trim().toUpperCase() : null;
        const companyId = normName ? nameToCompanyId.get(normName) : null;

        if (!companyId) {
            defaultersUnmatched++;
            continue;
        }

        const defaulterName = clean(row.DEFAULTERNAME) || 'Unknown';
        const gstNumber = clean(row.GSTNO) || '';
        const panNumber = clean(row.FIRM_PANNO) || '';
        const defaultAmount = Number(clean(row.AMOUNT)) || 0;

        const key = defaulterKey(companyId, defaulterName, gstNumber, panNumber, defaultAmount);
        if (existingDefaulterKeys.has(key)) {
            defaultersSkipped++;
            continue;
        }
        existingDefaulterKeys.add(key);

        const addrParts = parseAddressParts(clean(row.DEFAULTER_FULL_ADDRESS));

        const persons = [];
        if (clean(row.CONTACTPERSON)) {
            persons.push({ name: clean(row.CONTACTPERSON), pan: panNumber, aadhar: clean(row.CONTACTAADHARNO) || '' });
        }
        if (clean(row.PARTNERNAME)) {
            persons.push({ name: clean(row.PARTNERNAME), pan: '', aadhar: clean(row.PARTNERAADHARNO) || '' });
        }
        if (clean(row.PARTNERNAME2)) {
            persons.push({ name: clean(row.PARTNERNAME2), pan: '', aadhar: clean(row.PARTNERAADHARNO2) || '' });
        }

        const payments = [];
        const paymentAmount = clean(row.PAYMENT_AMOUNT);
        if (paymentAmount && !isNaN(Number(paymentAmount))) {
            const paymentDateRaw = clean(row.PAYMENT_DATE);
            payments.push({
                amount: Number(paymentAmount),
                date: paymentDateRaw ? new Date(paymentDateRaw) : new Date(),
                type: 'partial'
            });
        }

        const outstanding = row.OUTSTANDING !== null && row.OUTSTANDING !== undefined ? Number(row.OUTSTANDING) || 0 : defaultAmount;

        newDefaulterDocs.push({
            user_id: companyId,
            reported_by_id: companyId,
            reported_by_role: 'member',
            defaulter_name: defaulterName,
            mobile_number: clean(row.CONTACTNO) || '',
            gst_number: gstNumber,
            pan_number: panNumber,
            aadhar_number: clean(row.CONTACTAADHARNO) || '',
            state: addrParts.state || '',
            district: addrParts.district || '',
            cities: addrParts.subDistrict || '',
            city: addrParts.city || '',
            default_amount: defaultAmount,
            outstanding_amount: outstanding,
            industry: clean(row.TYPETEXT) || '',
            reason_description: [clean(row.ABOUTDEFAULTER), clean(row.REMARKS)].filter(Boolean).join(' | '),
            defaulter_address: clean(row.DEFAULTER_FULL_ADDRESS) || clean(row.DEFAULTERADDRESS) || '',
            court_complex_name: clean(row.COURTNAME) || '',
            case_type: clean(row.CASETYPE) || '',
            case_number: clean(row.CASENO) || '',
            case_year: clean(row.CASEYEAR) || '',
            case_status: clean(row.CASESTATUS) || '',
            legal_status_taken: !!(clean(row.COURTNAME) || clean(row.CASETYPE)),
            defaulter_persons: persons,
            payments,
            status: 1
        });
    }

    if (newDefaulterDocs.length > 0) {
        await DefaulterReport.insertMany(newDefaulterDocs, { ordered: false });
    }

    return {
        companies: { totalInFile: companyRows.length, inserted: newCompanyDocs.length, alreadyExisted: companiesSkipped },
        defaulters: { totalInFile: defaulterRows.length, inserted: newDefaulterDocs.length, alreadyExisted: defaultersSkipped, unmatchedCompany: defaultersUnmatched }
    };
}

module.exports = { runImport };
