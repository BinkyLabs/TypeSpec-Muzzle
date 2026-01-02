namespace OpenAI;

#suppress "@azure-tools/typespec-azure-core/documentation-required" "Auto-suppressed warnings non-applicable rules during import."
model Foo {}

#suppress "@azure-tools/typespec-azure-core/documentation-required" "Auto-suppressed warnings non-applicable rules during import."
model Bar {}

#suppress "@azure-tools/typespec-azure-core/documentation-required" "Auto-suppressed warnings non-applicable rules during import."
#suppress "@azure-tools/typespec-azure-core/no-unnamed-union" "Auto-suppressed warnings non-applicable rules during import."
model FooBarArray is (Foo | Bar)[];
