CREATE TABLE "ProductImage" (
    "productId" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("productId"),
    CONSTRAINT "ProductImage_content_size" CHECK (octet_length("content") BETWEEN 1 AND 1048576)
);

ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE;
