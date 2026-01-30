import React, { useState } from 'react';
import { statusOptions, sourceOptions } from '../config/settings';
import type { Company } from '../types';
import { useAppStore } from '../stores/appStore';
import { formatCompanyData, type FormattedCompany } from '../utils/companyFormatter';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';

interface CompanyGridProps {
    companies: Company[];
}

// 詳細モーダルコンポーネント
const CompanyDetailModal: React.FC<{
    company: Company | null;
    formatted: FormattedCompany | null;
    open: boolean;
    onClose: () => void;
}> = ({ company, formatted, open, onClose }) => {
    if (!company || !formatted) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl bg-gray-900 border-gray-700 text-gray-100 max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-white">
                        {formatted.companyName}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 text-sm">
                    {/* 基本情報 */}
                    <section>
                        <h4 className="font-semibold text-blue-400 mb-2 border-b border-gray-700 pb-1">
                            基本情報
                        </h4>
                        <dl className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                            <dt className="text-gray-400">会社名</dt>
                            <dd className="text-gray-200">{formatted.fullCompanyName}</dd>

                            <dt className="text-gray-400">所在地</dt>
                            <dd className="text-gray-200">{company.address || '-'}</dd>

                            <dt className="text-gray-400">設立</dt>
                            <dd className="text-gray-200">{formatted.establishment}</dd>

                            <dt className="text-gray-400">代表者</dt>
                            <dd className="text-gray-200">{formatted.representative}</dd>
                        </dl>
                    </section>

                    {/* 事業内容 */}
                    <section>
                        <h4 className="font-semibold text-blue-400 mb-2 border-b border-gray-700 pb-1">
                            事業内容
                        </h4>
                        <p className="text-gray-200 whitespace-pre-wrap">
                            {formatted.fullIndustry}
                        </p>
                    </section>

                    {/* 採用情報 */}
                    <section>
                        <h4 className="font-semibold text-blue-400 mb-2 border-b border-gray-700 pb-1">
                            採用情報
                        </h4>
                        <dl className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                            <dt className="text-gray-400">求人タイトル</dt>
                            <dd className="text-gray-200">{company.job_title || '-'}</dd>

                            <dt className="text-gray-400">給与</dt>
                            <dd className="text-gray-200 whitespace-pre-wrap">{formatted.fullSalary}</dd>
                        </dl>
                    </section>

                    {/* 企業規模 */}
                    <section>
                        <h4 className="font-semibold text-blue-400 mb-2 border-b border-gray-700 pb-1">
                            企業規模
                        </h4>
                        <dl className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                            <dt className="text-gray-400">従業員数</dt>
                            <dd className="text-gray-200">{formatted.fullScale}</dd>

                            <dt className="text-gray-400">売上高</dt>
                            <dd className="text-gray-200">{formatted.revenue}</dd>
                        </dl>
                    </section>

                    {/* リンク */}
                    <section>
                        <h4 className="font-semibold text-blue-400 mb-2 border-b border-gray-700 pb-1">
                            リンク
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            <a
                                href={company.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs"
                            >
                                求人ページ
                            </a>
                            {company.homepage_url && (
                                <a
                                    href={company.homepage_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white text-xs"
                                >
                                    企業HP
                                </a>
                            )}
                            {company.contact_form_url && (
                                <a
                                    href={company.contact_form_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-white text-xs"
                                >
                                    問い合わせ
                                </a>
                            )}
                        </div>
                    </section>

                    {/* メモ */}
                    {company.note && (
                        <section>
                            <h4 className="font-semibold text-blue-400 mb-2 border-b border-gray-700 pb-1">
                                メモ
                            </h4>
                            <p className="text-gray-200 whitespace-pre-wrap">{company.note}</p>
                        </section>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export const CompanyGrid: React.FC<CompanyGridProps> = ({ companies }) => {
    const updateCompany = useAppStore((state) => state.updateCompany);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    const getStatusBadge = (status: string) => {
        const option = statusOptions.find((opt) => opt.value === status);
        return option || { value: status, label: status, color: 'gray' };
    };

    const handleStatusChange = async (id: number, status: string) => {
        await updateCompany(id, { status });
    };

    const openDetail = (company: Company) => {
        setSelectedCompany(company);
        setModalOpen(true);
    };

    const closeDetail = () => {
        setModalOpen(false);
        setSelectedCompany(null);
    };

    const openGoogleSearch = (companyName: string) => {
        const query = encodeURIComponent(companyName);
        window.open(`https://www.google.com/search?q=${query}`, '_blank');
    };

    return (
        <>
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-gray-800/50">
                            <tr>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[180px]">会社名</th>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[120px]">業種</th>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[100px]">給与</th>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[80px]">規模</th>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[80px]">エリア</th>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[60px]">ソース</th>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[80px]">ステータス</th>
                                <th className="px-2 py-2 text-left font-medium text-gray-300 w-[80px]">アクション</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {companies.map((company) => {
                                const formatted = formatCompanyData(company);
                                const statusBadge = getStatusBadge(company.status);

                                return (
                                    <tr
                                        key={company.id}
                                        className="hover:bg-gray-800/30 h-10"
                                    >
                                        {/* 会社名 */}
                                        <td className="px-2 py-1">
                                            <a
                                                href={company.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 truncate max-w-[150px] block"
                                                title={formatted.fullCompanyName}
                                            >
                                                {formatted.companyName}
                                            </a>
                                        </td>

                                        {/* 業種 */}
                                        <td className="px-2 py-1">
                                            <span
                                                className="text-gray-400 truncate block max-w-[110px]"
                                                title={formatted.fullIndustry}
                                            >
                                                {formatted.industry}
                                            </span>
                                        </td>

                                        {/* 給与 */}
                                        <td className="px-2 py-1">
                                            <span
                                                className="text-green-400 truncate block max-w-[90px]"
                                                title={formatted.fullSalary}
                                            >
                                                {formatted.salary}
                                            </span>
                                        </td>

                                        {/* 規模 */}
                                        <td className="px-2 py-1">
                                            <span
                                                className="text-gray-400 truncate block max-w-[70px]"
                                                title={formatted.fullScale}
                                            >
                                                {formatted.scale}
                                            </span>
                                        </td>

                                        {/* エリア */}
                                        <td className="px-2 py-1">
                                            <span className="text-gray-400 truncate block max-w-[70px]">
                                                {formatted.area}
                                            </span>
                                        </td>

                                        {/* ソース */}
                                        <td className="px-2 py-1">
                                            <span className="text-gray-500 text-[10px]">
                                                {sourceOptions.find((s) => s.value === company.source)?.label ||
                                                    company.source}
                                            </span>
                                        </td>

                                        {/* ステータス */}
                                        <td className="px-2 py-1">
                                            <select
                                                className={`text-[10px] px-1.5 py-0.5 rounded border-none cursor-pointer
                                                    ${statusBadge.color === 'gray' ? 'bg-gray-600 text-gray-200' : ''}
                                                    ${statusBadge.color === 'blue' ? 'bg-blue-600 text-white' : ''}
                                                    ${statusBadge.color === 'green' ? 'bg-green-600 text-white' : ''}
                                                    ${statusBadge.color === 'yellow' ? 'bg-yellow-600 text-white' : ''}
                                                    ${statusBadge.color === 'red' ? 'bg-red-600 text-white' : ''}
                                                `}
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

                                        {/* アクション */}
                                        <td className="px-2 py-1">
                                            <div className="flex gap-1">
                                                <button
                                                    className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                                                    onClick={() => openDetail(company)}
                                                    title="詳細を見る"
                                                >
                                                    詳細
                                                </button>
                                                <button
                                                    className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                                                    onClick={() => openGoogleSearch(formatted.companyName)}
                                                    title="Google検索"
                                                >
                                                    🔍
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {companies.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                        データがありません。スクレイピングを開始してください。
                    </div>
                )}
            </div>

            {/* 詳細モーダル */}
            <CompanyDetailModal
                company={selectedCompany}
                formatted={selectedCompany ? formatCompanyData(selectedCompany) : null}
                open={modalOpen}
                onClose={closeDetail}
            />
        </>
    );
};
