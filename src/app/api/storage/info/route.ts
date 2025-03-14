import { NextResponse } from "next/server";
import { User } from "@/models/User";
import { connectToDatabase } from "@/lib/mongodb";
import { FREE_STORAGE_LIMIT } from '@/lib/constants';

// Mark this route as dynamic to allow headers usage
export const dynamic = 'force-dynamic';

// Set a timeout for the entire route
export const maxDuration = 10; // 10 seconds

export async function GET(req: Request) {
  try {
    // Get the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "No authorization header" },
        { status: 401 }
      );
    }

    // Clean up the wallet address (remove any "Bearer " prefix if present)
    const walletAddress = authHeader.replace('Bearer ', '').toLowerCase();

    console.log('Connecting to database...');
    try {
      await connectToDatabase();
      console.log('Connected to database');
    } catch (error) {
      console.error('Database connection error:', error);
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 503 }
      );
    }

    console.log('Finding user with wallet address:', walletAddress);
    // Get user's storage information
    let user;
    try {
      user = await User.findOne({ walletAddress });
      console.log('User found:', user ? 'yes' : 'no');
    } catch (error) {
      console.error('User lookup error:', error);
      return NextResponse.json(
        { error: "Failed to lookup user" },
        { status: 500 }
      );
    }

    if (!user) {
      // Create a new user with default values
      try {
        const newUser = new User({
          walletAddress,
          totalStorageUsed: 0,
          totalStoragePurchased: 0,
          totalAvailableStorage: FREE_STORAGE_LIMIT,
        });
        await newUser.save();
        console.log('Created new user');

        return NextResponse.json({
          totalStorageUsed: 0,
          totalStoragePurchased: 0,
          totalAvailableStorage: FREE_STORAGE_LIMIT,
          remainingStorage: FREE_STORAGE_LIMIT,
        });
      } catch (error) {
        console.error('User creation error:', error);
        return NextResponse.json(
          { error: "Failed to create new user" },
          { status: 500 }
        );
      }
    }

    // Calculate total available storage (free + purchased)
    const totalAvailableStorage = FREE_STORAGE_LIMIT + (user.totalStoragePurchased || 0);
    const totalStorageUsed = user.totalStorageUsed || 0;
    const remainingStorage = Math.max(0, totalAvailableStorage - totalStorageUsed);

    console.log('Returning storage info:', {
      totalStorageUsed,
      totalStoragePurchased: user.totalStoragePurchased || 0,
      totalAvailableStorage,
      remainingStorage,
    });

    return NextResponse.json({
      totalStorageUsed,
      totalStoragePurchased: user.totalStoragePurchased || 0,
      totalAvailableStorage,
      remainingStorage,
    });
  } catch (error) {
    console.error("Storage info error:", error);
    return NextResponse.json(
      { error: "Failed to fetch storage information" },
      { status: 500 }
    );
  }
} 