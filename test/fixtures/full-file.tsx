"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardBody } from "@/components/ui/card"
import Link from "next/link"
import type { Product, Category } from "@/types"

interface ProductListProps {
  initialProducts: Product[]
  categories: Category[]
}

export default function ProductList({ initialProducts, categories }: ProductListProps) {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const formRef = useRef(null)
  const router = useRouter()

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.name.includes(search));
  }, [products, search])

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    setProducts(prev => prev.filter(p => p.id !== id));
  }, [])

  useEffect(() => {
    fetchProducts().then(setProducts);
  }, [])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <Button onClick={() => router.push("/products/new")}>Add Product</Button>
      </div>
      <input
        className="flex items-center px-4 py-2 border rounded-lg"
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-col gap-4">
        {filteredProducts.map(product => (
          <Card key={product.id}>
            <CardHeader>
              <h2 className="text-lg font-bold">{product.name}</h2>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500">{product.description}</p>
              <div className="flex items-center gap-2 mt-4">
                <Link href={`/products/${product.id}`}>
                  <Button>View</Button>
                </Link>
                <Button onClick={() => handleDelete(product.id)}>Delete</Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}
