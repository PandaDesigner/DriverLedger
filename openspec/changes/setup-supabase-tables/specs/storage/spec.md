# Spec — storage

## Purpose

Define the storage buckets required for the application and their per-driver access rules. Aligned with the user-supplied default in chat (buckets land in this change, not in a later one).

## ADDED Requirements

### Requirement: storage-buckets

The system SHALL provision exactly two storage buckets: `avatares` (public read) and `recibos` (private, per-driver access).

#### Scenario: Both buckets provisioned

WHEN the storage migration is applied, THEN the system SHALL create `avatares` (public, with the project-defined size limit) and `recibos` (private, with the project-defined size limit).

#### Scenario: No additional buckets

WHEN the storage migration is applied, THEN the system SHALL NOT create any other storage buckets beyond `avatares` and `recibos`.

### Requirement: avatares-public-read

The `avatares` bucket SHALL allow public SELECT (avatar images are intentionally public). Writes to `avatares` SHALL be restricted to authenticated users.

#### Scenario: avatar read without auth

WHEN an anonymous client requests an object in `avatares`, THEN the system SHALL return the object.

#### Scenario: avatar write requires auth

WHEN an anonymous client attempts to INSERT into `avatares`, THEN the system SHALL reject the write.

### Requirement: recibos-private-per-driver-prefix

The `recibos` bucket SHALL restrict both SELECT and INSERT to authenticated sessions whose `auth.uid()` matches the first path segment of the object key (e.g., `recibos/<driver-uuid>/<file>` is readable only by that driver).

#### Scenario: cross-driver storage isolation

GIVEN two distinct authenticated sessions (driver-A and driver-B), WHEN driver-B attempts to SELECT an object at `recibos/driver-A-uuid/<file>`, THEN the system SHALL return zero rows (RLS denies).

#### Scenario: own driver storage read

WHEN driver-A requests an object at `recibos/driver-A-uuid/<file>`, THEN the system SHALL return the object.

### Requirement: storage-no-public-write

The system SHALL NOT allow anonymous (non-authenticated) INSERTs into either bucket.

#### Scenario: Anonymous INSERT rejected

WHEN an anonymous client attempts to INSERT into either `avatares` or `recibos`, THEN the system SHALL reject the write with an auth error.

#### Scenario: Authenticated INSERT permitted by bucket RLS

WHEN an authenticated driver INSERTs into `avatares` (their own avatar) or into `recibos` under `<their-uuid>/<file>`, THEN the system SHALL accept the write per the bucket RLS policies.

## REMOVED Requirements

None.

## MODIFIED Requirements

None.