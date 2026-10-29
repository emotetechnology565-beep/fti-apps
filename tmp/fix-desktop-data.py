from pathlib import Path
p=Path('src/features/catalog/components/DesktopCatalogue.tsx')
s=p.read_text(encoding='utf-8')
s=s.replace("import React, { useState, useMemo } from 'react';", "import React, { useState } from 'react';\nimport { useQuery } from '@tanstack/react-query';\nimport { supabaseCatalogRepository } from '../data/catalog-repository';\nimport { MatrixProductCard } from './MatrixProductCard';")
s=s.replace("import { Image } from 'expo-image';\n",'').replace("import { getCategoryImage } from './category-images';\n",'')
start=s.index('const filterCategories =')
end=s.index('export function DesktopCatalogue',start)
s=s[:start]+s[end:]
s=s.replace('  products,\n  total,\n','')
start=s.index('  // Source list:')
end=s.index('\n  return (',start)
s=s[:start]+'''  const catalogue = useQuery({
    queryKey: ['catalog', 'desktop', activeTab, selectedCategories],
    queryFn: async () => {
      const items: Product[] = [];
      const categories = new Map<string, { key: string; label: string }>();
      for (const category of selectedCategories.length ? selectedCategories : ['']) {
        let offset = 0;
        while (true) {
          const page = await supabaseCatalogRepository.listProducts({ productKind: activeTab, category: category || undefined, limit: 50, offset });
          items.push(...page.items);
          page.categories.forEach((entry) => categories.set(entry.slug, { key: entry.slug, label: entry.name }));
          offset += page.items.length;
          if (!page.items.length || offset >= page.total) break;
        }
      }
      return { items: [...new Map(items.map((item) => [item.id, item])).values()], categories: [...categories.values()] };
    },
    staleTime: 30_000,
  });
  const sourceProducts = catalogue.data?.items ?? [];
  const filterCategories = catalogue.data?.categories ?? [];
  const grades = (product: Product) => product.variants.map((variant) => String(variant.attributes.grade ?? '').trim()).filter(Boolean);
  const brands = (product: Product) => product.variants.map((variant) => String(variant.attributes.brand ?? '').trim()).filter(Boolean);
  const availableGradesList = ['All Grades', ...new Set(sourceProducts.flatMap(grades))];
  const availableBrandsList = ['All Brands', ...new Set(sourceProducts.flatMap(brands))];
  const filteredProducts = sourceProducts.filter((product) =>
    (!search.trim() || [product.name, product.category, ...grades(product)].join(' ').toLowerCase().includes(search.trim().toLowerCase())) &&
    (selectedGrade === 'All Grades' || grades(product).includes(selectedGrade)) &&
    (selectedBrand === 'All Brands' || brands(product).includes(selectedBrand))
  );
''' +s[end:]
s=s.replace('  const toggleCategory = (key: string) => {', "  const toggleCategory = (key: string) => {\n    setSelectedGrade('All Grades');\n    setSelectedBrand('All Brands');")
s=s.replace('{filteredProducts.length || 6}', '{filteredProducts.length}')
s=s.replace('<DesktopProductCard', '<MatrixProductCard')
s=s.replace('          {/* 2-Column Desktop Grid of Cards */}', '''          {catalogue.isPending ? <Txt>Loading catalogue...</Txt> : null}
          {catalogue.isError ? <Txt onPress={() => void catalogue.refetch()}>Could not load catalogue. Tap to retry.</Txt> : null}
          {!catalogue.isPending && !catalogue.isError && !filteredProducts.length ? <Txt>No products match these filters.</Txt> : null}
          {/* 2-Column Desktop Grid of Cards */}''')
start=s.index('function DesktopProductCard(')
end=s.index('const styles =',start)
s=s[:start]+s[end:]
p.write_text(s,encoding='utf-8')
