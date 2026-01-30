'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink } from 'lucide-react';

interface Company {
  id: string;
  source: 'mynavi' | 'rikunabi' | 'doda';
  name: string;
  catchphrase: string;
  address: string;
  phone?: string;
  contactFormUrl?: string;
  status: 'new' | 'contacted' | 'promising' | 'rejected' | 'ng';
  isNgCandidate: boolean;
}

// Sample data
const sampleCompanies: Company[] = [
  {
    id: '1',
    source: 'mynavi',
    name: 'テック株式会社',
    catchphrase: '次世代のIT技術で未来を創造',
    address: '東京都渋谷区',
    phone: '03-1234-5678',
    contactFormUrl: 'https://example.com/contact',
    status: 'promising',
    isNgCandidate: false,
  },
  {
    id: '2',
    source: 'rikunabi',
    name: 'グローバル企業',
    catchphrase: '世界規模でのビジネス展開',
    address: '大阪府大阪市',
    phone: '06-9876-5432',
    status: 'contacted',
    isNgCandidate: false,
  },
  {
    id: '3',
    source: 'doda',
    name: 'イノベーション社',
    catchphrase: '革新的なサービス提供企業',
    address: '東京都中央区',
    status: 'new',
    isNgCandidate: false,
  },
  {
    id: '4',
    source: 'mynavi',
    name: 'NG候補企業',
    catchphrase: 'NGリストに含まれる企業',
    address: '京都府京都市',
    status: 'ng',
    isNgCandidate: true,
  },
  {
    id: '5',
    source: 'rikunabi',
    name: '営業管理会社',
    catchphrase: '営業支援システムの提供',
    address: '福岡県福岡市',
    phone: '092-1234-5678',
    status: 'rejected',
    isNgCandidate: false,
  },
];

export function CompanyListPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // Updated default value
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const filteredCompanies = sampleCompanies.filter((company) => {
    const matchesSearch =
      searchQuery === '' ||
      company.name.includes(searchQuery) ||
      company.catchphrase.includes(searchQuery) ||
      company.address.includes(searchQuery);

    const matchesStatus =
      statusFilter === 'all' || company.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const toggleRowSelection = (id: string) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getSourceBadge = (source: Company['source']) => {
    const sourceMap = {
      mynavi: { label: 'マイナビ', color: 'bg-blue-100 text-blue-900' },
      rikunabi: { label: 'リクナビ', color: 'bg-green-100 text-green-900' },
      doda: { label: 'doda', color: 'bg-orange-100 text-orange-900' },
    };
    const config = sourceMap[source];
    return (
      <Badge className={`${config.color} border-0`}>{config.label}</Badge>
    );
  };

  const getStatusBadge = (status: Company['status']) => {
    const statusMap = {
      new: { label: '新規', color: 'bg-blue-100 text-blue-900' },
      contacted: { label: '連絡済', color: 'bg-yellow-100 text-yellow-900' },
      promising: { label: '見込あり', color: 'bg-green-100 text-green-900' },
      rejected: { label: '却下', color: 'bg-gray-100 text-gray-900' },
      ng: { label: 'NG', color: 'bg-red-100 text-red-900 font-bold' },
    };
    const config = statusMap[status];
    return (
      <Badge className={`${config.color} border-0`}>{config.label}</Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">企業リスト</h1>
        <p className="mt-2 text-muted-foreground">全ての企業を管理・検索</p>
      </div>

      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-sm font-semibold">全 {filteredCompanies.length} 件</div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="new">新規</SelectItem>
              <SelectItem value="contacted">連絡済</SelectItem>
              <SelectItem value="promising">見込あり</SelectItem>
              <SelectItem value="rejected">却下</SelectItem>
              <SelectItem value="ng">NG</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" size="sm">
              CSV出力
            </Button>
            <Button variant="outline" size="sm">
              更新
            </Button>
          </div>
        </div>
      </Card>

      {/* Search */}
      <Input
        placeholder="企業名・キャッチフレーズ・住所で検索"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedRows.size === filteredCompanies.length && filteredCompanies.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedRows(
                          new Set(filteredCompanies.map((c) => c.id))
                        );
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="w-20">ソース</TableHead>
                <TableHead className="min-w-56">企業名</TableHead>
                <TableHead className="min-w-48">連絡先</TableHead>
                <TableHead className="min-w-72">情報</TableHead>
                <TableHead className="w-24">ステータス</TableHead>
                <TableHead className="w-20 text-right">アクション</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.map((company) => (
                <TableRow
                  key={company.id}
                  className={`${
                    company.isNgCandidate
                      ? 'border-l-4 border-l-red-500 bg-red-50'
                      : ''
                  }`}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedRows.has(company.id)}
                      onCheckedChange={() => toggleRowSelection(company.id)}
                    />
                  </TableCell>
                  <TableCell>{getSourceBadge(company.source)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-semibold">{company.name}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1"
                        onClick={() =>
                          window.open(
                            `https://google.com/search?q=${company.name}`,
                            '_blank'
                          )
                        }
                      >
                        <span className="text-xs underline">Google</span>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {company.phone && (
                        <p className="text-sm">{company.phone}</p>
                      )}
                      {company.contactFormUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto gap-1 p-0 text-xs"
                          onClick={() =>
                            window.open(company.contactFormUrl, '_blank')
                          }
                        >
                          <ExternalLink className="h-3 w-3" />
                          問合せフォーム
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="truncate text-sm">{company.catchphrase}</p>
                      <p className="text-xs text-muted-foreground">
                        {company.address}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(company.status)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          操作
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>メモ編集</DropdownMenuItem>
                        <DropdownMenuItem>ステータス変更</DropdownMenuItem>
                        <DropdownMenuItem>詳細表示</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          削除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pagination */}
      {filteredCompanies.length > 0 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm">
            前へ
          </Button>
          <span className="text-sm text-muted-foreground">50件ずつ表示</span>
          <Button variant="outline" size="sm">
            次へ
          </Button>
        </div>
      )}

      {filteredCompanies.length === 0 && (
        <Card className="flex items-center justify-center p-12">
          <p className="text-center text-muted-foreground">
            まだデータがありません。検索ページからスクレイピングを開始してください。
          </p>
        </Card>
      )}
    </div>
  );
}
