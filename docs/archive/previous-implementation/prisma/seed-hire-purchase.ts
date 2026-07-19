/**
 * Seeds a small, realistic demo dataset for the Hire Purchase module against
 * the existing "Rock Frost Demo Fleet" organization. Idempotent-ish: safe to
 * re-run, but will skip creating rows that already exist by unique key.
 * Run with: npx tsx prisma/seed-hire-purchase.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const branch = await db.branch.findFirst({ where: { organizationId: org.id } });

  const hpManagerRole = await db.role.findFirstOrThrow({ where: { name: "Hire Purchase Manager", isSystem: true } });

  let hpUser = await db.user.findUnique({ where: { email: "hirepurchase@demo.com" } });
  if (!hpUser) {
    hpUser = await db.user.create({
      data: {
        name: "Efua Darko",
        email: "hirepurchase@demo.com",
        passwordHash: await bcrypt.hash("HirePurchase@2026", 10),
        status: "ACTIVE",
      },
    });
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: hpUser.id,
        roleId: hpManagerRole.id,
        branchId: branch?.id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    console.log("Created login hirepurchase@demo.com / HirePurchase@2026 (Hire Purchase Manager)");
  }

  await db.hirePurchaseSettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id },
  });

  let staff = await db.hirePurchaseStaff.findFirst({ where: { organizationId: org.id, code: "EFU" } });
  if (!staff) {
    staff = await db.hirePurchaseStaff.create({
      data: {
        organizationId: org.id,
        branchId: branch?.id,
        userId: hpUser.id,
        code: "EFU",
        fullName: "Efua Darko",
        email: "hirepurchase@demo.com",
        phone: "0244 555 0101",
        monthlySalary: 1800,
      },
    });
    await db.hirePurchaseStaffSalaryHistory.create({
      data: {
        organizationId: org.id,
        staffId: staff.id,
        monthlySalary: 1800,
        effectiveMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      },
    });
    console.log("Created staff EFU (Efua Darko)");
  }

  const categories = [
    { name: "Electronics", sortOrder: 10 },
    { name: "Furniture", sortOrder: 20 },
    { name: "Appliances", sortOrder: 30 },
  ];
  for (const c of categories) {
    await db.hirePurchaseProductCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name: c.name } },
      update: {},
      create: { organizationId: org.id, name: c.name, sortOrder: c.sortOrder },
    });
  }

  const productSeeds = [
    { name: '43" Smart TV', category: "Electronics", costPrice: 1800, transportCost: 50, dailyAmount: 15, duration: 184 },
    { name: "3-Seater Sofa Set", category: "Furniture", costPrice: 2400, transportCost: 150, dailyAmount: 20, duration: 184 },
    { name: "Double Door Fridge", category: "Appliances", costPrice: 3200, transportCost: 100, dailyAmount: 25, duration: 184 },
  ];

  const products: { id: string; costPrice: number; transportCost: number }[] = [];
  for (const p of productSeeds) {
    let product = await db.hirePurchaseProduct.findFirst({ where: { organizationId: org.id, name: p.name } });
    if (!product) {
      product = await db.hirePurchaseProduct.create({
        data: {
          organizationId: org.id,
          name: p.name,
          category: p.category,
          costPrice: p.costPrice,
          transportCost: p.transportCost,
          dailyAmount: p.dailyAmount,
          duration: p.duration,
          price: p.dailyAmount * p.duration,
          quantityOnSale: 0,
          active: true,
        },
      });
      await db.hirePurchaseStaffInventory.upsert({
        where: { staffId_productId: { staffId: staff.id, productId: product.id } },
        update: {},
        create: { organizationId: org.id, staffId: staff.id, productId: product.id, quantity: 10 },
      });
      console.log(`Created product ${p.name}`);
    }
    products.push({ id: product.id, costPrice: Number(product.costPrice), transportCost: Number(product.transportCost) });
  }

  const customerSeeds = [
    { name: "Yaa Asantewaa", phone: "0201 234 567", address: "Adum, Kumasi" },
    { name: "Kofi Annan Jr.", phone: "0245 678 901", address: "East Legon, Accra" },
    { name: "Abena Pokuaa", phone: "0208 112 233", address: "Takoradi Market Circle" },
    { name: "Kwabena Osei", phone: "0277 445 566", address: "Tamale Central" },
  ];

  const year = new Date().getFullYear().toString().slice(-2);
  const customers: { id: string; staffId: string }[] = [];
  for (const [index, c] of customerSeeds.entries()) {
    let customer = await db.hirePurchaseCustomer.findFirst({ where: { organizationId: org.id, fullName: c.name } });
    if (!customer) {
      const customerCode = `CUST/${staff.code}/${year}/${String(index + 1).padStart(3, "0")}`;
      customer = await db.hirePurchaseCustomer.create({
        data: {
          organizationId: org.id,
          branchId: branch?.id,
          customerCode,
          fullName: c.name,
          phone: c.phone,
          address: c.address,
          staffId: staff.id,
        },
      });
      console.log(`Created customer ${c.name} (${customerCode})`);
    }
    customers.push({ id: customer.id, staffId: customer.staffId });
  }

  function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  const existingAccounts = await db.hirePurchaseAccount.count({ where: { organizationId: org.id } });
  if (existingAccounts === 0 && customers.length >= 3 && products.length >= 3) {
    const now = new Date();

    // Account 1: nearly complete, several payments
    const start1 = addDays(now, -150);
    const product1 = products[0];
    const target1 = 15 * 184;
    const account1 = await db.hirePurchaseAccount.create({
      data: {
        organizationId: org.id,
        branchId: branch?.id,
        customerId: customers[0].id,
        productId: product1.id,
        inventoryStaffId: staff.id,
        startDate: start1,
        expectedEndDate: addDays(start1, 184),
        targetAmount: target1,
        dailyAmount: 15,
        totalPaid: 2400,
        balance: Math.max(target1 - 2400, 0),
        status: "ACTIVE",
      },
    });
    let receiptSeq = 1;
    for (let i = 0; i < 6; i++) {
      await db.hirePurchasePayment.create({
        data: {
          organizationId: org.id,
          receiptNo: `RCPT/${year}/${String(receiptSeq++).padStart(6, "0")}`,
          accountId: account1.id,
          amount: 400,
          paymentDate: addDays(start1, i * 25),
          method: "MOBILE_MONEY",
          receivedBy: hpUser.id,
        },
      });
    }
    await db.hirePurchaseStaffInventory.updateMany({
      where: { staffId: staff.id, productId: product1.id },
      data: { quantity: { decrement: 1 } },
    });

    // Account 2: just started, one payment
    const start2 = addDays(now, -10);
    const product2 = products[1];
    const target2 = 20 * 184;
    const account2 = await db.hirePurchaseAccount.create({
      data: {
        organizationId: org.id,
        branchId: branch?.id,
        customerId: customers[1].id,
        productId: product2.id,
        inventoryStaffId: staff.id,
        startDate: start2,
        expectedEndDate: addDays(start2, 184),
        targetAmount: target2,
        dailyAmount: 20,
        totalPaid: 200,
        balance: Math.max(target2 - 200, 0),
        status: "ACTIVE",
      },
    });
    await db.hirePurchasePayment.create({
      data: {
        organizationId: org.id,
        receiptNo: `RCPT/${year}/${String(receiptSeq++).padStart(6, "0")}`,
        accountId: account2.id,
        amount: 200,
        paymentDate: start2,
        method: "CASH",
        receivedBy: hpUser.id,
      },
    });
    await db.hirePurchaseStaffInventory.updateMany({
      where: { staffId: staff.id, productId: product2.id },
      data: { quantity: { decrement: 1 } },
    });

    // Account 3: completed with an overpayment credit
    const start3 = addDays(now, -200);
    const product3 = products[2];
    const target3 = 25 * 184;
    const account3 = await db.hirePurchaseAccount.create({
      data: {
        organizationId: org.id,
        branchId: branch?.id,
        customerId: customers[2].id,
        productId: product3.id,
        inventoryStaffId: staff.id,
        startDate: start3,
        expectedEndDate: addDays(start3, 184),
        targetAmount: target3,
        dailyAmount: 25,
        totalPaid: target3,
        balance: 0,
        status: "COMPLETED",
        deliveryStatus: "DELIVERED",
        deliveredAt: addDays(now, -5),
        deliveredBy: hpUser.id,
      },
    });
    const finalPaymentAmount = 300;
    const finalReceiptNo = `RCPT/${year}/${String(receiptSeq++).padStart(6, "0")}`;
    const finalPayment = await db.hirePurchasePayment.create({
      data: {
        organizationId: org.id,
        receiptNo: finalReceiptNo,
        accountId: account3.id,
        amount: finalPaymentAmount,
        paymentDate: addDays(now, -6),
        method: "BANK_TRANSFER",
        receivedBy: hpUser.id,
      },
    });
    await db.hirePurchaseCredit.create({
      data: {
        organizationId: org.id,
        customerId: customers[2].id,
        accountId: account3.id,
        paymentId: finalPayment.id,
        amount: 60,
        remainingAmount: 60,
        status: "OPEN",
        source: "PAYMENT_OVERPAYMENT",
        notes: `Overpayment from receipt ${finalReceiptNo}`,
        createdBy: hpUser.id,
      },
    });
    await db.hirePurchaseStaffInventory.updateMany({
      where: { staffId: staff.id, productId: product3.id },
      data: { quantity: { decrement: 1 } },
    });

    console.log("Created 3 demo accounts with payment history and one open credit.");
  } else {
    console.log("Accounts already exist — skipping demo account creation.");
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
