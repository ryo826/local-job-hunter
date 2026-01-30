import React, { useState } from 'react';
import { ngWords, statusOptions, sourceOptions } from '../config/settings';
import type { Company } from '../types';
import { useAppStore } from '../stores/appStore';

interface CompanyGridProps {
    companies: Company[];
}

export const CompanyGrid: React.FC<CompanyGridProps> = ({ companies }) => {
    const updateCompany = useAppStore((state) => state.updateCompany);
    const [editingNotes, setEditingNotes] = useState<number | null>(null);
    const [notesValue, setNotesValue] = useState('');

    const isNgCompany = (company: Company): boolean => {
        return ngWords.some((word) => company.company_name.includes(word));
    };

    const getStatusBadge = (status: string) => {
        const option = statusOptions.find((opt) => opt.value === status);
        return option || { value: status, label: status, color: 'gray' };
    };

    const handleStatusChange = async (id: number, status: string) => {
        await updateCompany(id, { status });
    };

    const handleNotesEdit = (company: Company) => {
        setEditingNotes(company.id);
        setNotesValue(company.note || '');
    };

    const handleNotesSave = async (id: number) => {
        await updateCompany(id, { note: notesValue });
        setEditingNotes(null);
        setNotesValue('');
    };

    const handlePhoneEdit = async (id: number, phone: string) => {
        await updateCompany(id, { phone });
    };

    const openGoogleSearch = (companyName: string) => {
        const query = encodeURIComponent(companyName);
        window.open(`https://www.google.com/search?q=${query}`, '_blank');
    };

    const openContactForm = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ width: '200px' }}>会社名</th>
                            <th style={{ width: '150px' }}>住所</th>
                            <th style={{ width: '100px' }}>電話番号</th>
                            <th style={{ width: '80px' }}>ソース</th>
                            <th style={{ width: '100px' }}>ステータス</th>
                            <th style={{ width: '200px' }}>メモ</th>
                            <th style={{ width: '120px' }}>アクション</th>
                        </tr>
                    </thead>
                    <tbody>
                        {companies.map((company) => {
                            const statusBadge = getStatusBadge(company.status);
                            const isNg = isNgCompany(company);

                            return (
                                <tr key={company.id} className={isNg ? 'row-ng' : ''}>
                                    <td>
                                        <div className="flex flex-col">
                                            <a
                                                href={company.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 font-medium"
                                            >
                                                {company.company_name}
                                            </a>
                                            {isNg && (
                                                <span className="text-xs text-red-400 mt-1">
                                                    ⚠ NGワード検出
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="text-sm text-gray-400">{company.address || '-'}</td>
                                    <td>
                                        <input
                                            type="text"
                                            className="input text-sm py-1 px-2"
                                            defaultValue={company.phone || ''}
                                            placeholder="電話番号"
                                            onBlur={(e) => handlePhoneEdit(company.id, e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <span className="text-sm text-gray-400">
                                            {sourceOptions.find((s) => s.value === company.source)?.label ||
                                                company.source}
                                        </span>
                                    </td>
                                    <td>
                                        <select
                                            className={`badge badge-${statusBadge.color} cursor-pointer border-none`}
                                            value={company.status}
                                            onChange={(e) => handleStatusChange(company.id, e.target.value)}
                                        >
                                            {statusOptions.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        {editingNotes === company.id ? (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    className="input text-sm py-1 px-2 flex-1"
                                                    value={notesValue}
                                                    onChange={(e) => setNotesValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleNotesSave(company.id);
                                                        if (e.key === 'Escape') setEditingNotes(null);
                                                    }}
                                                    autoFocus
                                                />
                                                <button
                                                    className="btn-icon text-green-400"
                                                    onClick={() => handleNotesSave(company.id)}
                                                >
                                                    ✓
                                                </button>
                                            </div>
                                        ) : (
                                            <div
                                                className="text-sm text-gray-400 cursor-pointer hover:text-gray-300"
                                                onClick={() => handleNotesEdit(company)}
                                            >
                                                {company.note || 'クリックして編集'}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div className="flex gap-2">
                                            <button
                                                className="btn btn-icon tooltip"
                                                data-tooltip="Google検索"
                                                onClick={() => openGoogleSearch(company.company_name)}
                                            >
                                                🔍
                                            </button>
                                            {company.contact_form_url && (
                                                <button
                                                    className="btn btn-icon tooltip"
                                                    data-tooltip="問い合わせフォーム"
                                                    onClick={() => openContactForm(company.contact_form_url!)}
                                                >
                                                    📝
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {companies.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    データがありません。スクレイピングを開始してください。
                </div>
            )}
        </div>
    );
};
